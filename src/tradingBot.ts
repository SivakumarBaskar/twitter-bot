cat > src/tradingBot.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — TRADING BOT ORCHESTRATOR
// ════════════════════════════════════════════════════

import { config } from './config';
import { signalDB, tradeDB, eventDB } from './database';
import { fetchAllPrices } from './priceMonitor';
import {
  generateSignal,
  checkSignalStatus,
  formatSignalPost,
  formatTP1Post,
  formatTP2Post,
  formatSLPost,
} from './signalEngine';
import {
  launchBrowser,
  loginToX,
  postTweet,
  closeBrowser,
} from './puppeteerEngine';
import { sendTelegram } from './telegram';
import { runWeeklyAnalysis, adjustParameters, generateAndSendWeeklyReport } from './metaLearning';
import { getUniqueTemplate } from './templates';
import type { TradingSignal, TradeRecord } from './types';

// ════════════════════════════════════════════════════
// SESSION HELPERS
// ════════════════════════════════════════════════════
function getCurrentSession(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 0 && hour < 8) return 'Asian Session';
  if (hour >= 8 && hour < 17) return 'London Session';
  if (hour >= 13 && hour < 22) return 'New York Session';
  return 'Off Hours';
}

function getSessionAssets() {
  const hour = new Date().getUTCHours();
  // London: FX + Gold
  if (hour >= 7 && hour < 12) {
    return config.assets.filter(a => ['FX', 'COMMODITY'].includes(a.type));
  }
  // Crypto 4H check times
  if ([5, 9, 13, 17, 21].includes(hour)) {
    return config.assets.filter(a => a.type === 'CRYPTO');
  }
  // NY index ORB
  if (hour >= 14 && hour < 16) {
    return config.assets.filter(a => a.type === 'INDEX');
  }
  return config.assets;
}

// ════════════════════════════════════════════════════
// POST TO X HELPER
// ════════════════════════════════════════════════════
async function postToX(text: string): Promise<string | null> {
  try {
    await launchBrowser();
    const loggedIn = await loginToX();
    if (!loggedIn) { await closeBrowser(); return null; }
    const url = await postTweet(text);
    await closeBrowser();
    return url;
  } catch (error) {
    console.error('[TradingBot] X post error:', error);
    try { await closeBrowser(); } catch {}
    return null;
  }
}

// ════════════════════════════════════════════════════
// MAIN SIGNAL SCAN
// ════════════════════════════════════════════════════
export async function runSignalScan(): Promise<void> {
  const session = getCurrentSession();
  const assets = getSessionAssets();

  console.log(`\n📡 Signal scan — ${session}`);
  console.log(`   Checking ${assets.length} assets`);

  const todayCount = signalDB.countToday();
  if (todayCount >= (config.strategy.maxSignalsPerDay || 8)) {
    console.log(`   ⚠️ Daily limit reached (${todayCount}). Skipping.`);
    return;
  }

  let priceMap: Map<string, any>;
  try {
    priceMap = await fetchAllPrices();
  } catch (error) {
    console.error('[TradingBot] Price fetch failed:', error);
    return;
  }

  let signalsGenerated = 0;

  for (const asset of assets) {
    const priceData = priceMap.get(asset.symbol);
    if (!priceData) continue;

    try {
      const signal = await generateSignal(priceData, asset, session);
      if (!signal) continue;

      signalsGenerated++;
      signalDB.save(signal);
      console.log(`   ✅ Signal: ${signal.symbol} ${signal.direction}`);

      const postText = formatSignalPost(signal);
      const postUrl = await postToX(postText);

      if (postUrl) {
        signalDB.markPosted(signal.id, postUrl);
        console.log(`   ✅ Posted to X`);
      }

      await sendTelegram({
        type: 'SIGNAL',
        title: `📊 Signal: ${signal.displayName}`,
        body: postText,
        timestamp: Date.now(),
      });

      await new Promise(r => setTimeout(r, 5000));
    } catch (error) {
      console.error(`[TradingBot] Error for ${asset.symbol}:`, error);
      eventDB.log('SIGNAL_ERROR', `Failed for ${asset.symbol}`, { error: String(error) });
    }
  }

  console.log(`   Scan complete: ${signalsGenerated} signal(s)`);
}

// ════════════════════════════════════════════════════
// MONITOR ACTIVE SIGNALS
// ════════════════════════════════════════════════════
export async function monitorActiveSignals(): Promise<void> {
  const active = signalDB.getActive();
  if (active.length === 0) return;

  console.log(`\n👁️ Monitoring ${active.length} active signal(s)...`);

  const priceMap = await fetchAllPrices().catch(() => new Map());

  for (const signal of active) {
    try {
      const priceData = priceMap.get(signal.symbol);
      if (!priceData) continue;

      const currentPrice = priceData.current;
      const { newStatus, pnlPips } = checkSignalStatus(signal, currentPrice);

      if (newStatus === signal.status) continue;

      console.log(`   🚨 ${signal.symbol}: ${signal.status} → ${newStatus}`);

      signalDB.updateStatus(signal.id, newStatus, {
        pnlPips,
        tp1HitAt: newStatus === 'TP1_HIT' ? Date.now() : signal.tp1HitAt,
        tp2HitAt: newStatus === 'TP2_HIT' ? Date.now() : signal.tp2HitAt,
        slHitAt: newStatus === 'SL_HIT' ? Date.now() : signal.slHitAt,
      });

      await handleStatusChange(signal, newStatus, pnlPips);

      if (['TP2_HIT', 'SL_HIT'].includes(newStatus)) {
        await saveTradeRecord(signal, newStatus, pnlPips, currentPrice);
      }
    } catch (error) {
      console.error(`[TradingBot] Monitor error for ${signal.symbol}:`, error);
    }
  }
}

// ════════════════════════════════════════════════════
// HANDLE STATUS CHANGE
// ════════════════════════════════════════════════════
async function handleStatusChange(
  signal: TradingSignal,
  newStatus: string,
  pnlPips: number
): Promise<void> {
  let postText: string;
  let telegramType: 'TP_HIT' | 'SL_HIT' | 'INFO';
  let telegramTitle: string;

  switch (newStatus) {
    case 'TP1_HIT':
      postText = formatTP1Post(signal);
      telegramType = 'TP_HIT';
      telegramTitle = `✅ TP1 Hit — ${signal.displayName}`;
      break;
    case 'TP2_HIT':
      postText = formatTP2Post(signal);
      telegramType = 'TP_HIT';
      telegramTitle = `🏆 TP2 Hit — ${signal.displayName}`;
      break;
    case 'SL_HIT':
      postText = formatSLPost(signal);
      telegramType = 'SL_HIT';
      telegramTitle = `⚠️ SL Hit — ${signal.displayName}`;
      break;
    default:
      return;
  }

  await postToX(postText);

  await sendTelegram({
    type: telegramType,
    title: telegramTitle,
    body: postText,
    timestamp: Date.now(),
  });

  eventDB.log('SIGNAL_UPDATE', `${signal.symbol} → ${newStatus}`, { pnlPips });
}

// ════════════════════════════════════════════════════
// SAVE TRADE RECORD
// ════════════════════════════════════════════════════
async function saveTradeRecord(
  signal: TradingSignal,
  finalStatus: string,
  pnlPips: number,
  exitPrice: number
): Promise<void> {
  const record: TradeRecord = {
    id: `${signal.id}-closed-${Date.now()}`,
    signalId: signal.id,
    symbol: signal.symbol,
    direction: signal.direction,
    entry: signal.entry,
    exit: exitPrice,
    stopLoss: signal.stopLoss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    status: finalStatus as any,
    pnlPips,
    pnlPercent: signal.entry > 0 ? (pnlPips / signal.entry) * 100 : 0,
    confluenceScore: signal.confluenceScore,
    session: signal.session,
    rsiAtEntry: signal.indicators.rsi.value,
    macdAtEntry: signal.indicators.macd.crossover,
    trendAtEntry: signal.indicators.ema.trend,
    atrAtEntry: signal.indicators.atr,
    createdAt: signal.createdAt,
    closedAt: Date.now(),
  };

  tradeDB.save(record);
  console.log(`   ✅ Trade record saved (${signal.symbol})`);
}

// ════════════════════════════════════════════════════
// DAILY SUMMARY
// ════════════════════════════════════════════════════
export async function sendDailySummary(): Promise<void> {
  console.log('\n📊 Generating daily summary...');

  const todaySignals = signalDB.countToday();
  const activeSignals = signalDB.getActive();
  const recentTrades = tradeDB.getLast7Days();

  const wins = recentTrades.filter(t => t.pnlPips > 0).length;
  const losses = recentTrades.filter(t => t.pnlPips <= 0).length;
  const totalPips = Math.round(recentTrades.reduce((s, t) => s + t.pnlPips, 0));
  const winRate = recentTrades.length > 0 ? ((wins / recentTrades.length) * 100).toFixed(1) : '0';

  const vars: any = {
    asset: 'EURUSD', direction: 'LONG', entry: 0,
    stopLoss: 0, tp1: 0, tp2: 0, rr: '0',
    triggers: '', session: 'EOD',
    signalsToday: todaySignals, wins, losses, totalPips,
    asset1: activeSignals[0]?.symbol || 'EURUSD',
    asset2: activeSignals[1]?.symbol || 'XAUUSD',
  };

  const eodTweet = getUniqueTemplate('eod_recap', vars);
  if (eodTweet) {
    const finalText = eodTweet.length > 280 ? eodTweet.substring(0, 277) + '...' : eodTweet;
    await postToX(finalText);
  }

  const telegramBody = [
    `Signals today: ${todaySignals}`,
    `Active: ${activeSignals.length}`,
    `7-day: ${wins}W / ${losses}L | WR: ${winRate}%`,
    `7-day pips: ${totalPips > 0 ? '+' : ''}${totalPips}`,
    activeSignals.length > 0
      ? `Open:\n${activeSignals.map(s => `  ${s.symbol} ${s.direction} @ ${s.entry} [${s.status}]`).join('\n')}`
      : 'No open positions.',
    'Bot: ✅ Running',
  ].join('\n');

  await sendTelegram({
    type: 'DAILY_SUMMARY',
    title: '📊 Daily Summary',
    body: telegramBody,
    timestamp: Date.now(),
  });

  console.log('   ✅ Daily summary sent');
}

// ════════════════════════════════════════════════════
// WEEKLY ROUTINE
// ════════════════════════════════════════════════════
export async function runWeeklyRoutine(): Promise<void> {
  console.log('\n🧠 Running weekly routine...');
  try {
    const metrics = await runWeeklyAnalysis();
    await adjustParameters(metrics);
    await generateAndSendWeeklyReport(metrics);
    console.log('✅ Weekly routine complete');
  } catch (error) {
    console.error('[TradingBot] Weekly routine error:', error);
    await sendTelegram({
      type: 'ERROR',
      title: '❌ Weekly Routine Failed',
      body: String(error),
      timestamp: Date.now(),
    });
  }
}
ENDOFFILE
