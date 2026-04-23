import { config } from './config';
import { signalDB, tradeDB, eventDB } from './database';
import { fetchAllPrices, getCurrentPrice } from './priceMonitor';
import { generateSignal, checkSignalStatus,
         formatSignalPost, formatTP1Post,
         formatTP2Post, formatSLPost } from './signalEngine';
import { postTweet, loginToX, launchBrowser,
         closeBrowser } from './puppeteerEngine';
import { sendTelegram } from './telegram';
import { runWeeklyAnalysis, adjustParameters,
         generateAndSendWeeklyReport } from './metaLearning';
import type { TradingSignal, TradeRecord } from './types';

// ════════════════════════════════════════════════════
// GET CURRENT TRADING SESSION
// ════════════════════════════════════════════════════
function getCurrentSession(): string {
  const hour = new Date().getUTCHours();

  if (hour >= 0 && hour < 9)   return 'Asian Session';
  if (hour >= 8 && hour < 17)  return 'London Session';
  if (hour >= 13 && hour < 22) return 'New York Session';
  return 'Off Hours';
}

// ════════════════════════════════════════════════════
// GET ASSETS FOR CURRENT SESSION
// ════════════════════════════════════════════════════
function getSessionAssets(session: string): typeof config.assets {
  const sessionMap: Record<string, string[]> = {
    'Asian Session':    config.sessions.asian.assets,
    'London Session':   config.sessions.london.assets,
    'New York Session': config.sessions.newYork.assets,
  };

  const sessionAssets = sessionMap[session];
  if (!sessionAssets) return config.assets; // Off hours — check all

  return config.assets.filter(a => sessionAssets.includes(a.symbol));
}

// ════════════════════════════════════════════════════
// MAIN SIGNAL SCAN
// ════════════════════════════════════════════════════
export async function runSignalScan(): Promise<void> {
  const session = getCurrentSession();
  console.log(`\n📡 Running signal scan — ${session}`);
  console.log('Time:', new Date().toISOString());

  const sessionAssets = getSessionAssets(session);
  console.log(`Checking ${sessionAssets.length} assets for ${session}`);

  // Fetch price data for session assets
  const priceMap = await fetchAllPrices();

  let signalsGenerated = 0;

  for (const asset of sessionAssets) {
    const priceData = priceMap.get(asset.symbol);
    if (!priceData) {
      console.log(`  ⚠️ No price data for ${asset.symbol}`);
      continue;
    }

    try {
      const signal = await generateSignal(priceData, asset, session);

      if (signal) {
        signalsGenerated++;

        // Save signal to database
        signalDB.save(signal);

        // Post to X
        await postSignalToX(signal);

        // Notify Telegram
        await sendTelegram({
          type: 'SIGNAL',
          title: `📊 New Signal: ${signal.displayName}`,
          body: formatSignalPost(signal),
          timestamp: Date.now(),
        });

        // Delay between signals
        await new Promise(r => setTimeout(r, 5000));
      }

    } catch (error) {
      console.error(`Error generating signal for ${asset.symbol}:`, error);
    }
  }

  console.log(`\n✅ Signal scan complete: ${signalsGenerated} signals generated`);
}

// ════════════════════════════════════════════════════
// POST SIGNAL TO X
// ════════════════════════════════════════════════════
async function postSignalToX(signal: TradingSignal): Promise<void> {
  try {
    await launchBrowser();
    const loggedIn = await loginToX();

    if (!loggedIn) {
      console.error('❌ Could not login to post signal');
      return;
    }

    const postText = formatSignalPost(signal);
    const postUrl = await postTweet(postText);

    if (postUrl) {
      signalDB.markPosted(signal.id, postUrl);
      console.log(`✅ Signal posted to X: ${signal.symbol}`);
    }

  } catch (error) {
    console.error('Error posting to X:', error);
  } finally {
    await closeBrowser();
  }
}

// ════════════════════════════════════════════════════
// MONITOR ACTIVE SIGNALS
// ════════════════════════════════════════════════════
export async function monitorActiveSignals(): Promise<void> {
  const activeSignals = signalDB.getActive();

  if (activeSignals.length === 0) return;

  console.log(`\n👁️ Monitoring ${activeSignals.length} active signals...`);

  for (const signal of activeSignals) {
    try {
      // Get current asset config
      const assetConfig = config.assets.find(a => a.symbol === signal.symbol);
      if (!assetConfig) continue;

      // Get current price
      const currentPrice = await getCurrentPrice(assetConfig);
      if (!currentPrice) continue;

      // Check if any levels hit
      const { newStatus, pnlPips } = checkSignalStatus(signal, currentPrice);

      if (newStatus !== signal.status) {
        console.log(`\n🚨 ${signal.symbol}: Status changed ${signal.status} → ${newStatus}`);

        // Update in database
        signalDB.updateStatus(signal.id, newStatus, {
          pnlPips,
          tp1HitAt: newStatus === 'TP1_HIT' ? Date.now() : signal.tp1HitAt,
          tp2HitAt: newStatus === 'TP2_HIT' ? Date.now() : signal.tp2HitAt,
          slHitAt: newStatus === 'SL_HIT' ? Date.now() : signal.slHitAt,
        });

        // Post update to X and Telegram
        await handleStatusChange(signal, newStatus, pnlPips);

        // If closed, save trade record for learning
        if (['TP2_HIT', 'SL_HIT'].includes(newStatus)) {
          await saveTradeRecord(signal, newStatus, pnlPips, currentPrice);
        }
      }

    } catch (error) {
      console.error(`Error monitoring ${signal.symbol}:`, error);
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

  switch (newStatus) {
    case 'TP1_HIT':
      postText = formatTP1Post(signal);
      telegramType = 'TP_HIT';
      break;
    case 'TP2_HIT':
      postText = formatTP2Post(signal);
      telegramType = 'TP_HIT';
      break;
    case 'SL_HIT':
      postText = formatSLPost(signal);
      telegramType = 'SL_HIT';
      break;
    default:
      return;
  }

  // Post to X
  try {
    await launchBrowser();
    const loggedIn = await loginToX();
    if (loggedIn) {
      await postTweet(postText);
    }
  } catch (e) {
    console.error('Failed to post update to X:', e);
  } finally {
    await closeBrowser();
  }

  // Notify Telegram
  await sendTelegram({
    type: telegramType,
    title: `${newStatus === 'SL_HIT' ? '⚠️ SL Hit' : '✅ TP Hit'} — ${signal.displayName}`,
    body: postText,
    timestamp: Date.now(),
  });

  eventDB.log('SIGNAL_UPDATE', `${signal.symbol} → ${newStatus}`, {
    signalId: signal.id,
    pnlPips,
  });
}

// ════════════════════════════════════════════════════
// SAVE TRADE RECORD (for meta-learning)
// ════════════════════════════════════════════════════
async function saveTradeRecord(
  signal: TradingSignal,
  finalStatus: string,
  pnlPips: number,
  exitPrice: number
): Promise<void> {

  const record: TradeRecord = {
    id: `${signal.id}-closed`,
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
    pnlPercent: (pnlPips / signal.entry) * 100,
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
  console.log(`✅ Trade record saved for meta-learning: ${signal.symbol}`);
}

// ════════════════════════════════════════════════════
// WEEKLY ROUTINE
// ════════════════════════════════════════════════════
export async function runWeeklyRoutine(): Promise<void> {
  console.log('\n🧠 Running weekly meta-learning routine...');

  try {
    // Analyze performance
    const metrics = await runWeeklyAnalysis();

    // Auto-adjust parameters
    await adjustParameters(metrics);

    // Generate and send report
    await generateAndSendWeeklyReport(metrics);

    console.log('✅ Weekly routine complete');

  } catch (error) {
    console.error('❌ Weekly routine failed:', error);
    await sendTelegram({
      type: 'ERROR',
      title: '❌ Weekly Routine Failed',
      body: String(error),
      timestamp: Date.now(),
    });
  }
}

// ════════════════════════════════════════════════════
// DAILY SUMMARY
// ════════════════════════════════════════════════════
export async function sendDailySummary(): Promise<void> {
  const todaySignals = signalDB.countToday();
  const activeSignals = signalDB.getActive();
  const winRate = tradeDB.getWinRate();

  const summary = [
    `📅 Daily Summary`,
    ``,
    `Signals today: ${todaySignals}`,
    `Active signals: ${activeSignals.length}`,
    `30-day win rate: ${winRate.toFixed(1)}%`,
    ``,
    `Active positions:`,
    ...activeSignals.map(s =>
      `  ${s.symbol} ${s.direction} @ ${s.entry} [${s.status}]`
    ),
    ``,
    `Bot status: ✅ Running`,
  ].join('\n');

  await sendTelegram({
    type: 'DAILY_SUMMARY',
    title: '📊 Daily Summary',
    body: summary,
    timestamp: Date.now(),
  });
}
