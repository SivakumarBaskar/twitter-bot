// ════════════════════════════════════════════════════
// APEX BOT v7.0 — META LEARNING (REWRITTEN)
// Analyzes trade results weekly
// Auto-adjusts adaptive parameters per asset
// Posts weekly insight to X + Telegram
// Integrates content performance insights
// ════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';
import { tradeDB, adaptiveDB, eventDB } from './database';
import { sendTelegram } from './telegram';
import { getUniqueTemplate } from './templates';
import { getContentInsights } from './contentLearning';
import type {
  PerformanceMetrics,
  AssetPerformance,
  SessionPerformance,
  TradeRecord,
  AdaptiveParams,
} from './types';
import {
  launchBrowser,
  loginToX,
  postTweet,
  closeBrowser,
} from './puppeteerEngine';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// ════════════════════════════════════════════════════
// WEEKLY PERFORMANCE ANALYSIS
// ════════════════════════════════════════════════════
export async function runWeeklyAnalysis(): Promise<PerformanceMetrics> {
  console.log('\n🧠 Running weekly meta-learning analysis...');

  const trades = tradeDB.getLast7Days();

  if (trades.length === 0) {
    console.log('   No trades this week to analyze');
    return buildEmptyMetrics();
  }

  const wins = trades.filter(t => t.pnlPips > 0).length;
  const losses = trades.filter(t => t.pnlPips <= 0).length;
  const winRate = (wins / trades.length) * 100;
  const totalPips = trades.reduce((s, t) => s + t.pnlPips, 0);
  const avgRR = calcAvgRR(trades);
  const maxDrawdown = calcMaxDrawdown(trades);

  const byAsset = buildAssetBreakdown(trades);
  const bySession = buildSessionBreakdown(trades);
  const byConfluence = buildConfluenceBreakdown(trades);

  console.log(`   ✅ Analysis: ${trades.length} trades, ${winRate.toFixed(1)}% WR, ${totalPips > 0 ? '+' : ''}${totalPips.toFixed(1)} pips`);

  return {
    period: 'last_7_days',
    totalTrades: trades.length,
    wins,
    losses,
    winRate,
    avgRR,
    totalPips,
    maxDrawdown,
    byAsset,
    bySession,
    byConfluence,
  };
}

// ════════════════════════════════════════════════════
// AUTO-ADJUST PARAMETERS
// ════════════════════════════════════════════════════
export async function adjustParameters(metrics: PerformanceMetrics): Promise<void> {
  console.log('\n⚙️ Auto-adjusting parameters...');
  const adjustments: string[] = [];

  // Global: raise confluence requirement if WR too low
  if (metrics.winRate < 45 && metrics.totalTrades >= 5) {
    const cur = config.strategy.minConfluenceScore as number;
    if (cur < 4) {
      (config.strategy as any).minConfluenceScore = 4;
      adjustments.push('Global: raised min confluence to 4 (WR below 45%)');
    }
  }

  // Global: relax if WR very high
  if (metrics.winRate > 68 && metrics.totalTrades >= 10) {
    const cur = config.strategy.minConfluenceScore as number;
    if (cur > 3) {
      (config.strategy as any).minConfluenceScore = 3;
      adjustments.push('Global: relaxed min confluence to 3 (WR above 68%)');
    }
  }

  // Global: reduce risk if drawdown high
  if (metrics.maxDrawdown > 8) {
    const cur = config.strategy.riskPerTrade as number;
    const newRisk = Math.max(0.5, cur - 0.25);
    (config.strategy as any).riskPerTrade = newRisk;
    adjustments.push(`Global: risk reduced to ${newRisk}% (drawdown ${metrics.maxDrawdown.toFixed(1)}%)`);
  }

  // Per-asset adjustments
  for (const [symbol, perf] of Object.entries(metrics.byAsset)) {
    if (perf.trades < 3) continue;

    const params = adaptiveDB.get(symbol);
    let updated = false;
    const reasons: string[] = [];

    // Poor WR: tighten requirements
    if (perf.winRate < 40) {
      params.rsiOverbought = Math.min(75, params.rsiOverbought + 2);
      params.rsiOversold = Math.max(25, params.rsiOversold - 2);
      params.minConfluenceScore = Math.min(5, params.minConfluenceScore + 1);
      reasons.push(`low WR (${perf.winRate.toFixed(0)}%) — tightened`);
      updated = true;
    }

    // Good WR: can slightly relax
    if (perf.winRate > 70 && perf.trades >= 5) {
      params.minConfluenceScore = Math.max(3, params.minConfluenceScore - 1);
      reasons.push(`high WR (${perf.winRate.toFixed(0)}%) — relaxed`);
      updated = true;
    }

    // Update preferred sessions based on where wins came from
    if (perf.bestSession && perf.trades >= 5 && !params.preferredSessions.includes(perf.bestSession)) {
      params.preferredSessions = [perf.bestSession];
      reasons.push(`best session: ${perf.bestSession}`);
      updated = true;
    }

    if (updated) {
      params.lastUpdated = Date.now();
      params.updateReason = reasons.join(', ');
      adaptiveDB.save(params);
      adjustments.push(`${symbol}: ${reasons.join(', ')}`);
      console.log(`   ✅ Updated ${symbol}: ${reasons.join(', ')}`);
    }
  }

  if (adjustments.length > 0) {
    await sendTelegram({
      type: 'INFO',
      title: '🧠 Meta-Learning: Parameters Updated',
      body: adjustments.map(a => `• ${a}`).join('\n'),
      timestamp: Date.now(),
    });

    eventDB.log('META_LEARNING', 'Parameters adjusted', { adjustments });
  } else {
    console.log('   ✅ No adjustments needed this week');
  }
}

// ════════════════════════════════════════════════════
// GENERATE AND SEND WEEKLY REPORT
// Posts to X via template AND sends detail to Telegram
// ════════════════════════════════════════════════════
export async function generateAndSendWeeklyReport(
  metrics: PerformanceMetrics
): Promise<void> {

  const sorted = Object.entries(metrics.byAsset)
    .sort(([, a], [, b]) => b.winRate - a.winRate);
  const topAsset = sorted[0]?.[0] || 'N/A';
  const worstAsset = sorted[sorted.length - 1]?.[0] || 'N/A';

  // Get content learning insights
  let contentInsight = '';
  try {
    const ci = getContentInsights();
    if (ci.totalPostsTracked >= 3) {
      contentInsight = `Best content category: ${ci.bestCategory} (${ci.bestDay}s perform best)`;
    }
  } catch {
    // Content learning might not have data yet
  }

  // Build vars for weekly insight template
  const vars: any = {
    asset: topAsset,
    direction: 'LONG',
    entry: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    rr: metrics.avgRR.toFixed(1),
    triggers: '',
    session: 'Weekly',
    signalsToday: metrics.totalTrades,
    wins: metrics.wins,
    losses: metrics.losses,
    winRate: metrics.winRate,
    totalPips: Math.round(metrics.totalPips),
    avgRR: metrics.avgRR,
    bestAsset: topAsset,
    worstAsset: worstAsset,
  };

  // Post weekly insight to X
  const xPost = getUniqueTemplate('weekly_insight', vars);

  if (xPost) {
    const finalText = xPost.length > 280
      ? xPost.substring(0, 277) + '...'
      : xPost;

    try {
      const { launchBrowser, loginToX, postTweet, closeBrowser } = await import('./puppeteerEngine');
      await launchBrowser();
      const loggedIn = await loginToX();
      if (loggedIn) {
        await postTweet(finalText);
        console.log('   ✅ Weekly insight posted to X');
      }
      await closeBrowser();
    } catch (error) {
      console.error('   ❌ Failed to post weekly insight to X:', error);
      try { await closeBrowser(); } catch {}
    }
  }

  // Detailed Telegram report
  const sessionLines = Object.entries(metrics.bySession)
    .map(([s, p]) => `  ${s}: ${p.wins}/${p.trades} (${p.winRate.toFixed(0)}% WR)`);

  const telegramBody = [
    `Period: Last 7 days`,
    `Trades: ${metrics.totalTrades}  ✅${metrics.wins} / ❌${metrics.losses}`,
    `Win Rate: ${metrics.winRate.toFixed(1)}%`,
    `Avg RR: ${metrics.avgRR.toFixed(2)}:1`,
    `Total Pips: ${metrics.totalPips > 0 ? '+' : ''}${Math.round(metrics.totalPips)}`,
    `Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%`,
    '',
    `🏆 Best Asset: ${topAsset}`,
    `⚠️ Worst Asset: ${worstAsset}`,
    '',
    'Session Performance:',
    ...sessionLines,
    '',
    contentInsight ? `📝 Content: ${contentInsight}` : '',
    '',
    '🧠 Parameters auto-adjusted for next week',
  ].filter(Boolean).join('\n');

  await sendTelegram({
    type: 'WEEKLY_REPORT',
    title: '📊 Weekly Performance Report',
    body: telegramBody,
    timestamp: Date.now(),
  });

  console.log('   ✅ Weekly report sent to Telegram');

  // Also try Gemini analysis for extra insight
  await runGeminiWeeklyAnalysis(metrics, topAsset, worstAsset);
}

// ════════════════════════════════════════════════════
// GEMINI ANALYSIS (optional enhancement)
// ════════════════════════════════════════════════════
async function runGeminiWeeklyAnalysis(
  metrics: PerformanceMetrics,
  topAsset: string,
  worstAsset: string
): Promise<void> {
  try {
    const prompt = `You are an expert algo trading analyst reviewing a week of results.

Stats:
- Trades: ${metrics.totalTrades}
- Win Rate: ${metrics.winRate.toFixed(1)}%
- Avg RR: ${metrics.avgRR.toFixed(2)}:1
- Total Pips: ${Math.round(metrics.totalPips)}
- Best Asset: ${topAsset}
- Worst Asset: ${worstAsset}
- Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%

In 3 bullet points (max 30 words each), what should be adjusted next week? Be specific about asset focus, session preference, or risk level. No generic advice.`;

    const result = await model.generateContent(prompt);
    const analysis = result.response.text().trim();

    if (analysis) {
      await sendTelegram({
        type: 'INFO',
        title: '🤖 Gemini Weekly Analysis',
        body: analysis,
        timestamp: Date.now(),
      });
    }
  } catch {
    // Gemini call failing is not critical
  }
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
function buildAssetBreakdown(trades: TradeRecord[]): Record<string, AssetPerformance> {
  const map: Record<string, { trades: number; wins: number; pips: number; sessions: Record<string, { wins: number; total: number }> }> = {};

  for (const t of trades) {
    if (!map[t.symbol]) map[t.symbol] = { trades: 0, wins: 0, pips: 0, sessions: {} };
    map[t.symbol].trades++;
    if (t.pnlPips > 0) map[t.symbol].wins++;
    map[t.symbol].pips += t.pnlPips;

    if (!map[t.symbol].sessions[t.session]) map[t.symbol].sessions[t.session] = { wins: 0, total: 0 };
    map[t.symbol].sessions[t.session].total++;
    if (t.pnlPips > 0) map[t.symbol].sessions[t.session].wins++;
  }

  const result: Record<string, AssetPerformance> = {};
  for (const [sym, data] of Object.entries(map)) {
    let bestSession = '';
    let bestSessionWR = 0;
    for (const [sess, sd] of Object.entries(data.sessions)) {
      const wr = sd.total > 0 ? sd.wins / sd.total : 0;
      if (wr > bestSessionWR) { bestSessionWR = wr; bestSession = sess; }
    }

    result[sym] = {
      symbol: sym,
      trades: data.trades,
      wins: data.wins,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      avgPips: data.trades > 0 ? data.pips / data.trades : 0,
      bestSession,
    };
  }
  return result;
}

function buildSessionBreakdown(trades: TradeRecord[]): Record<string, SessionPerformance> {
  const map: Record<string, { trades: number; wins: number; pips: number }> = {};

  for (const t of trades) {
    if (!map[t.session]) map[t.session] = { trades: 0, wins: 0, pips: 0 };
    map[t.session].trades++;
    if (t.pnlPips > 0) map[t.session].wins++;
    map[t.session].pips += t.pnlPips;
  }

  const result: Record<string, SessionPerformance> = {};
  for (const [sess, data] of Object.entries(map)) {
    result[sess] = {
      session: sess,
      trades: data.trades,
      wins: data.wins,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      avgPips: data.trades > 0 ? data.pips / data.trades : 0,
    };
  }
  return result;
}

function buildConfluenceBreakdown(trades: TradeRecord[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const t of trades) {
    if (!map[t.confluenceScore]) map[t.confluenceScore] = 0;
    if (t.pnlPips > 0) map[t.confluenceScore]++;
  }
  return map;
}

function calcAvgRR(trades: TradeRecord[]): number {
  const winners = trades.filter(t => t.pnlPips > 0);
  const losers = trades.filter(t => t.pnlPips <= 0);
  if (losers.length === 0 || winners.length === 0) return 0;

  const avgWin = winners.reduce((s, t) => s + t.pnlPips, 0) / winners.length;
  const avgLoss = Math.abs(losers.reduce((s, t) => s + t.pnlPips, 0)) / losers.length;

  return avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0;
}

function calcMaxDrawdown(trades: TradeRecord[]): number {
  let peak = 0;
  let equity = 0;
  let maxDD = 0;

  for (const t of trades) {
    equity += t.pnlPercent || 0;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return parseFloat(maxDD.toFixed(2));
}

function buildEmptyMetrics(): PerformanceMetrics {
  return {
    period: 'last_7_days',
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    avgRR: 0,
    totalPips: 0,
    maxDrawdown: 0,
    byAsset: {},
    bySession: {},
    byConfluence: {},
  };
}
