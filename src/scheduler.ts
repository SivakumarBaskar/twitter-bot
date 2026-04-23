import cron from 'node-cron';
import { runSignalScan, monitorActiveSignals,
         runWeeklyRoutine, sendDailySummary } from './tradingBot';
import { sendTelegram } from './telegram';
import { eventDB } from './database';

// ════════════════════════════════════════════════════
// ALL SCHEDULED JOBS
// ════════════════════════════════════════════════════
export function startScheduler(): void {
  console.log('⏰ Starting scheduler...');

  // ── SIGNAL SCANNING ───────────────────────────────
  // Every 4 hours — main signal scan
  cron.schedule('0 */4 * * *', async () => {
    console.log('\n⏰ Scheduled signal scan triggered');
    try {
      await runSignalScan();
    } catch (error) {
      console.error('Scheduled scan error:', error);
      eventDB.log('ERROR', 'Scheduled scan failed', { error: String(error) });
    }
  });

  // ── TRADE MONITORING ──────────────────────────────
  // Every 15 minutes — check if TP/SL hit
  cron.schedule('*/15 * * * *', async () => {
    try {
      await monitorActiveSignals();
    } catch (error) {
      console.error('Monitor error:', error);
    }
  });

  // ── DAILY SUMMARY ─────────────────────────────────
  // Every day at 20:00 UTC
  cron.schedule('0 20 * * *', async () => {
    console.log('\n📊 Sending daily summary...');
    try {
      await sendDailySummary();
    } catch (error) {
      console.error('Daily summary error:', error);
    }
  });

  // ── WEEKLY META-LEARNING ──────────────────────────
  // Every Sunday at 00:00 UTC
  cron.schedule('0 0 * * 0', async () => {
    console.log('\n🧠 Weekly meta-learning triggered');
    try {
      await runWeeklyRoutine();
    } catch (error) {
      console.error('Weekly routine error:', error);
    }
  });

  // ── HEALTH CHECK ──────────────────────────────────
  // Every hour — confirm bot is alive
  cron.schedule('0 * * * *', async () => {
    const now = new Date().toISOString();
    console.log(`💓 Health check: ${now}`);
    eventDB.log('HEALTH', 'Bot alive', { timestamp: now });
  });

  // ── STARTUP SCAN ──────────────────────────────────
  // Run one scan immediately on startup
  setTimeout(async () => {
    console.log('\n🚀 Running startup signal scan...');
    try {
      await runSignalScan();
    } catch (error) {
      console.error('Startup scan error:', error);
    }
  }, 15000); // 15 second delay to let everything initialize

  console.log('✅ All scheduled jobs started');
  console.log('  • Signal scan: Every 4 hours');
  console.log('  • Trade monitor: Every 15 minutes');
  console.log('  • Daily summary: 20:00 UTC daily');
  console.log('  • Meta-learning: Every Sunday 00:00 UTC');
  console.log('  • Health check: Every hour');
}
