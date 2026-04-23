import { config } from './config';
import { tradeDB, adaptiveDB, signalDB, eventDB } from './database';
import { generateWeeklyAnalysis } from './commentGen';
import { sendTelegram } from './telegram';
import type {
  AdaptiveParams,
  PerformanceMetrics,
  AssetPerformance,
  SessionPerformance,
  TradeRecord,
} from './types';

// ════════════════════════════════════════════════════
// WEEKLY PERFORMANCE ANALYSIS
// ════════════════════════════════════════════════════
export async function runWeeklyAnalysis(): Promise<PerformanceMetrics> {
  console.log('\n🧠 Running weekly meta-learning analysis...');

  const trades = tradeDB.getLast7Days();

  if (trades.length === 0) {
    console.log('No trades this week to analyze');
    return buildEmptyMetrics();
  }

  // ── OVERALL STATS ──────────────────────────────────
  const wins = trades.filter(t => t.pnlPips > 0).length;
  const losses = trades.filter(t => t.pnlPips <= 0).length;
  const winRate = (wins / trades.length) * 100;
  const totalPips = trades.reduce((sum, t) => sum + t.pnlPips, 0);
  const avgRR = calculateAvgRR(trades);
  const maxDrawdown = calculateMaxDrawdown(trades);

  // ── PER ASSET BREAKDOWN ────────────────────────────
  const byAsset = buildAssetBreakdown(trades);

  // ── PER SESSION BREAKDOWN ─────────────────────────
  const bySession = buildSessionBreakdown(trades);

  // ── PER CONFLUENCE SCORE ──────────────────────────
  const byConfluence = buildConfluenceBreakdown(trades);

  const metrics: PerformanceMetrics = {
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

  console.log(`✅ Analysis complete: ${trades.length} trades, ${winRate.toFixed(1)}% win rate`);

  return metrics;
}

// ════════════════════════════════════════════════════
// AUTO-ADJUST PARAMETERS (The Learning Part)
// ════════════════════════════════════════════════════
export async function adjustParameters(
  metrics: PerformanceMetrics
): Promise<void> {
  console.log('\n⚙️ Auto-adjusting parameters based on performance...');

  const adjustments: string[] = [];

  // ── GLOBAL ADJUSTMENTS ────────────────────────────

  // If overall win rate < 45%, raise minimum confluence score
  if (metrics.winRate < 45 && metrics.totalTrades >= 5) {
    const currentMin = config.strategy.minConfluenceScore;
    if (currentMin < 4) {
      console.log('  📈 Win rate low — raising minimum confluence score to 4');
      adjustments.push('Raised global min confluence to 4 (low win rate)');
      // Note: This updates runtime config
      (config.strategy as any).minConfluenceScore = 4;
    }
  }

  // If win rate > 65%, we can be slightly more lenient
  if (metrics.winRate > 65 && metrics.totalTrades >= 10) {
    const currentMin = config.strategy.minConfluenceScore;
    if (currentMin > 3) {
      console.log('  📉 Win rate high — can relax confluence to 3');
      adjustments.push('Relaxed global min confluence to 3 (high win rate)');
      (config.strategy as any).minConfluenceScore = 3;
    }
  }

  // If max drawdown > 8%, reduce risk
  if (metrics.maxDrawdown > 8) {
    console.log('  ⚠️ High drawdown — reducing risk per trade');
    adjustments.push('Reduced risk per trade (drawdown > 8%)');
    (config.strategy as any).riskPerTrade = Math.max(
      0.5,
      config.strategy.riskPerTrade - 0.25
    );
  }

  // ── PER ASSET ADJUSTMENTS ─────────────────────────
  for (const [symbol, perf] of Object.entries(metrics.byAsset)) {
    if (perf.trades < 3) continue; // Not enough data

    const currentParams = adaptiveDB.get(symbol);
    let updated = false;
    const reasons: string[] = [];

    // Poor win rate on this asset — tighten RSI
    if (perf.winRate < 40) {
      const newOverbought = Math.min(75, currentParams.rsiOverbought + 2);
      const newOversold = Math.max(25, currentParams.rsiOversold - 2);
      currentParams.rsiOverbought = newOverbought;
      currentParams.rsiOversold = newOversold;
      currentParams.minConfluenceScore = Math.min(5,
        currentParams.minConfluenceScore + 1);
      reasons.push(`low win rate (${perf.winRate.toFixed(0)}%)`);
      updated = true;
    }

    // Great win rate — can use current levels or slightly relax
    if (perf.winRate > 70 && perf.trades >= 5) {
      const newOverbought = Math.max(65, currentParams.rsiOverbought - 1);
      currentParams.rsiOverbought = newOverbought;
      reasons.push(`high win rate (${perf.winRate.toFixed(0)}%)`);
      updated = true;
    }

    // Update preferred sessions based on where wins happened
    if (perf.bestSession && perf.trades >= 5) {
      if (!currentParams.preferredSessions.includes(perf.bestSession)) {
        currentParams.preferredSessions = [perf.bestSession];
        reasons.push(`best in ${perf.bestSession} session`);
        updated = true;
      }
    }

    if (updated) {
      currentParams.lastUpdated = Date.now();
      currentParams.updateReason = reasons.join(', ');
      adaptiveDB.save(currentParams);
      console.log(`  ✅ Updated params for ${symbol}: ${reasons.join(', ')}`);
      adjustments.push(`${symbol}: ${reasons.join(', ')}`);
    }
  }

  // ── NOTIFY ADJUSTMENTS ────────────────────────────
  if (adjustments.length > 0) {
    await sendTelegram({
      type: 'INFO',
      title: '🧠 Meta-Learning: Parameters Updated',
      body: adjustments.map(a => `• ${a}`).join('\n'),
      timestamp: Date.now(),
    });

    eventDB.log('META_LEARNING', 'Parameters adjusted', { adjustments });
  } else {
    console.log('  ✅ No adjustments needed this week');
  }
}

// ════════════════════════════════════════════════════
// WEEKLY REPORT GENERATION & POSTING
// ════════════════════════════════════════════════════
export async function generateAndSendWeeklyReport(
  metrics: PerformanceMetrics
): Promise<void> {

  // Find top and worst performers
  const assetEntries = Object.entries(metrics.byAsset);
  const sorted = assetEntries.sort((a, b) => b[1].winRate - a[1].winRate);
  const topAsset = sorted[0]?.[0] || 'N/A';
  const worstAsset = sorted[sorted.length - 1]?.[0] || 'N/A';

  // Generate AI summary
  const weeklyPost = await generateWeeklyAnalysis({
    totalTrades: metrics.totalTrades,
    winRate: metrics.winRate,
    topAsset,
    worstAsset,
    avgRR: metrics.avgRR,
    totalPips: metrics.totalPips,
    suggestions: [],
  });

  // Detailed Telegram report
  const telegramReport = buildTelegramWeeklyReport(metrics, topAsset, worstAsset);

  await sendTelegram({
    type: 'WEEKLY_REPORT',
    title: '📊 Weekly Performance Report',
    body: telegramReport,
    timestamp: Date.now(),
  });

  console.log('✅ Weekly report sent to Telegram');
  console.log('📝 X post prepared:', weeklyPost.substring(0, 100));

  // Return the post for the trading bot to post to X
  eventDB.log('WEEKLY_REPORT', 'Weekly report generated', {
    metrics: {
      totalTrades: metrics.totalTrades,
      winRate: metrics.winRate,
      totalPips: metrics.totalPips,
    },
    xPost: weeklyPost,
  });
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
function buildAssetBreakdown(
  trades: TradeRecord[]
): Record<string, AssetPerformance> {
  const breakdown: Record<string, AssetPerformance> = {};

  for (const trade of trades) {
    if (!breakdown[trade.symbol]) {
      breakdown[trade.symbol] = {
        symbol: trade.symbol,
        trades: 0,
        wins: 0,
        winRate: 0,
        avgPips: 0,
        bestSession: '',
      };
    }

    const asset = breakdown[trade.symbol];
    asset.trades++;
    if (trade.pnlPips > 0) asset.wins++;
    asset.avgPips = ((asset.avgPips * (asset.trades - 1)) + trade.pnlPips) / asset.trades;
  }

  // Calculate win rates and best sessions
  for (const symbol of Object.keys(breakdown)) {
    const asset = breakdown[symbol];
    asset.winRate = (asset.wins / asset.trades) * 100;

    // Find best session for this asset
    const assetTrades = trades.filter(t => t.symbol === symbol);
    const sessionWins: Record<string, number> = {};
    const sessionTrades: Record<string, number> = {};

    for (const trade of assetTrades) {
      sessionTrades[trade.session] = (sessionTrades[trade.session] || 0) + 1;
      if (trade.pnlPips > 0) {
        sessionWins[trade.session] = (sessionWins[trade.session] || 0) + 1;
      }
    }

    let bestSession = '';
    let bestWinRate = 0;
    for (const session of Object.keys(sessionTrades)) {
      const wr = ((sessionWins[session] || 0) / sessionTrades[session]) * 100;
      if (wr > bestWinRate) {
        bestWinRate = wr;
        bestSession = session;
      }
    }
    asset.bestSession = bestSession;
  }

  return breakdown;
}

function buildSessionBreakdown(
  trades: TradeRecord[]
): Record<string, SessionPerformance> {
  const breakdown: Record<string, SessionPerformance> = {};

  for (const trade of trades) {
    if (!breakdown[trade.session]) {
      breakdown[trade.session] = {
        session: trade.session,
        trades: 0,
        wins: 0,
        winRate: 0,
        avgPips: 0,
      };
    }

    const session = breakdown[trade.session];
    session.trades++;
    if (trade.pnlPips > 0) session.wins++;
    session.avgPips = ((session.avgPips * (session.trades - 1)) + trade.pnlPips) / session.trades;
    session.winRate = (session.wins / session.trades) * 100;
  }

  return breakdown;
}

function buildConfluenceBreakdown(
  trades: TradeRecord[]
): Record<number, number> {
  const breakdown: Record<number, number> = {};

  for (const trade of trades) {
    const score = trade.confluenceScore;
    if (!breakdown[score]) breakdown[score] = 0;
    if (trade.pnlPips > 0) breakdown[score]++;
  }

  return breakdown;
}

function calculateAvgRR(trades: TradeRecord[]): number {
  const winners = trades.filter(t => t.pnlPips > 0);
  const losers = trades.filter(t => t.pnlPips <= 0);
  if (losers.length === 0) return 3;

  const avgWin = winners.reduce((s, t) => s + t.pnlPips, 0) / (winners.length || 1);
  const avgLoss = Math.abs(losers.reduce((s, t) => s + t.pnlPips, 0)) / losers.length;

  return avgLoss > 0 ? avgWin / avgLoss : 1;
}

function calculateMaxDrawdown(trades: TradeRecord[]): number {
  let peak = 0;
  let equity = 0;
  let maxDD = 0;

  for (const trade of trades) {
    equity += trade.pnlPercent;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

function buildTelegramWeeklyReport(
  metrics: PerformanceMetrics,
  topAsset: string,
  worstAsset: string
): string {
  const lines = [
    `📅 Week Summary`,
    ``,
    `Total Trades: ${metrics.totalTrades}`,
    `✅ Wins: ${metrics.wins}`,
    `❌ Losses: ${metrics.losses}`,
    `Win Rate: ${metrics.winRate.toFixed(1)}%`,
    `Avg RR: ${metrics.avgRR.toFixed(2)}`,
    `Total Pips: ${metrics.totalPips > 0 ? '+' : ''}${metrics.totalPips.toFixed(1)}`,
    `Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%`,
    ``,
    `🏆 Best Asset: ${topAsset}`,
    `⚠️ Worst Asset: ${worstAsset}`,
    ``,
    `Session Performance:`,
    ...Object.entries(metrics.bySession).map(([s, p]) =>
      `  ${s}: ${p.wins}/${p.trades} (${p.winRate.toFixed(0)}%)`
    ),
    ``,
    `🧠 Parameters auto-adjusted for next week`,
  ];

  return lines.join('\n');
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
