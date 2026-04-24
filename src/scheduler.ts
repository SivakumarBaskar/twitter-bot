// ════════════════════════════════════════════════════
// APEX BOT v7.0 — SCHEDULER (REWRITTEN)
// Signal scanning at strategy-specific times
// 7 daily content posts to X
// Trade monitoring
// Daily + weekly summaries to BOTH X and Telegram
// ══════════════════════════════════════════════════

import cron from 'node-cron';
import { runSignalScan, monitorActiveSignals, sendDailySummary, runWeeklyRoutine } from './tradingBot';
import { startContentScheduler, postWaitingIfNoSignals } from './contentScheduler';
import { startEngagementScheduler } from './engagementBot';
import { eventDB } from './database';

// ════════════════════════════════════════════════════
// STRATEGY-SPECIFIC SCAN TIMES
// Each strategy has optimal check windows
// ════════════════════════════════════════════════════

// FX + Gold: London Breakout
// Asian range closes ~07:00 UTC
// Breakout window: 07:00-12:00 UTC
// Scan every 30 min during window
const fxScanTimes = [
  '30 7 * * * *',   // 07:30
  '0 8 * * * *',     // 08:00
  '30 8 * * * *',   // 08:30
  '0 9 * * * *',     // 09:00
  '30 9 * * * *',   // 09:30
  '0 10 * * * *',    // 10:00
  '30 10 * * * *',  // 10:30
  '0 11 * * * *',    // 11:00
  '30 11 * * * *',  // 11:30
];

// Crypto: 4H ORB
// First 4H candle closes at 04:00 UTC
// Check every 4 hours after that
const cryptoScanTimes = [
  '0 5 * * * *',     // 05:00
  '0 9 * * * *',     // 09:00
  '0 13 * * * *',    // 13:00
  // 17:00 and 21:00 removed —
  // Crypto 4H candles at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
  // We check 1 hour AFTER each 4H candle closes
  // 04:00 + 1hr = 05:00, 08:00 + 1hr = 09:00, etc.
];

// US Indices: 30min ORB
// NY opens 13:30 UTC, ORB closes at 14:00 UTC
// Check at 14:30 and 15:00
const indexScanTimes = [
  '30 14 * * *',   // 14:30
  '0 15 * * * *',    // 15:00
];

// All scan times combined
const allScanTimes = [
  ...fxScanTimes,
  ...cryptoScanTimes,
  ...indexScanTimes,
];

// ══════════════════════════════════════════════════
// START ALL SCHEDULED JOBS
// ════════════════════════════════════════════════════
export function startScheduler(): void {
  console.log('⏰ Starting scheduler...');

  // ── SIGNAL SCANS (strategy-timed) ─────────────────────
  for (const cronExpr of allScanTimes) {
    cron.schedule(cronExpr, async () => {
      console.log('\n📡 Scheduled signal scan triggered');
      try {
        await runSignalScan();
      } catch (error) {
        console.error('Signal scan error:', error);
        eventDB.log('SCAN_ERROR', 'Scheduled scan failed', {
          error: String(error),
        });
      }
    });
  }
  console.log(`   Signal scans: ${allScanTimes.length} scheduled`);

  // ── TRADE MONITORING ─────────────────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      await monitorActiveSignals();
    } catch (error) {
      console.error('Monitor error:', error);
    }
  });
  console.log('   Trade monitor: Every 15 minutes');

  // ── DAILY SUMMARY (X + Telegram) ────────────────────────
  cron.schedule('0 20 * * * *', async () => {
    console.log('\n📊 Daily summary time...');
    try {
      // Post to X first
      const { postWaitingIfNoSignals } = await import('./contentScheduler');
      await postWaitingIfNoSignals();
      // Then send summary to Telegram
      await sendDailySummary();
    } catch (error) {
      console.error('Daily summary error:', error);
    }
  });
  console.log('   Daily summary: 20:00 UTC → X + Telegram');

  // ── WEEKLY META-LEARNING (X + Telegram) ─────────────────
  cron.schedule('0 0 * * 0', async () => {
    console.log('\n🧠 Weekly meta-learning time...');
    try {
      await runWeeklyRoutine();
    } catch (error) {
      console.error('Weekly routine error:', error);
    }
  });
  console.log('   Weekly learning: Sunday 00:00 UTC');

  // ── WAITING POST CHECK ─────────────────────────────────
  // At 17:00, if no signals posted today, post waiting post
  cron.schedule('0 17 * * * *', async () => {
    try {
      await postWaitingIfNoSignals();
    } catch (error) {
      console.error('Waiting post error:', error);
    }
  });
  console.log('   Waiting check: 17:00 UTC');

  // ── HEALTH CHECK ────────────────────────────────────
  cron.schedule('0 * * * * *', async () => {
    eventDB.log('HEALTH', 'Bot alive', {
      timestamp: new Date().toISOString(),
    });
  });
  console.log('   Health check: Every hour');

  // ── CONTENT SCHEDULER (7 daily posts to X) ────────────────
  startContentScheduler();

  // ── ENGAGEMENT SCHEDULER ───────────────────────────────
  startEngagementScheduler();

  console.log('\n✅ All scheduler jobs started');
  console.log('');
  console.log('SCHEDULE OVERVIEW:');
  console.log('──────────────');
  console.log('Signal scans (strategy-timed):');
  for (const expr of allScanTimes) {
    console.log(`   ${expr}`);
  }
  console.log('');
  console.log('Content posts (daily to X):');
  console.log('   03:00 UTC  Question');
  console.log('   07:00 UTC  Relatable');
  console.log('   09:00 UTC  Market Context');
  console.log('   12:00 UTC  Educational');
  console.log('   14:00 UTC  Question');
  console.log('   18:00 UTC  Meme/Humor');
  console.log('   20:00 UTC  EOD Recap (X + Telegram)');
  console.log('');
  console.log('Other:');
  console.log('   */15 min   Trade monitoring');
  console.log('   17:00 UTC  Waiting check');
  console.log('   Hourly    Health check');
  console.log('   Sun 00:00  Weekly learning');
  console.log('   */4hr      Engagement runs');
  console.log('');
}

// ════════════════════════════════════════════════════
// GET CURRENT SCAN TIMES FOR DISPLAY
// Used by Telegram /status command
// ════════════════════════════════════════════════════
export function getScanScheduleDisplay(): string {
  const lines: string[] = ['Signal scan schedule:'];

  const fxTimes = fxScanTimes.map(t => `   ${t} UTC`);
  const cryptoTimes = cryptoScanTimes.map(t => `   ${t} UTC`);
  const indexTimes = indexScanTimes.map(t => `   ${t} UTC`);

  if (fxTimes.length > 0) {
    lines.push('  FX + Gold (London Breakout):');
    lines.push(...fxTimes);
  }
  if (cryptoTimes.length > 0) {
    lines.push('  Crypto (4H ORB):');
    lines.push(...cryptoTimes);
  }
  if (indexTimes.length > 0) {
    lines.push('  US Indices (30min ORB):');
    lines.push(...indexTimes);
  }

  return lines.join('\n');
}
