cat > src/scheduler.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — MASTER SCHEDULER
// Wires all systems together with cron jobs
// ════════════════════════════════════════════════════

import cron from 'node-cron';
import { runSignalScan, monitorActiveSignals, sendDailySummary, runWeeklyRoutine } from './tradingBot';
import { startContentScheduler, postWaitingIfNoSignals } from './contentScheduler';
import { runEngagement } from './engagementBot';

export function startScheduler(): void {
  console.log('⏰ Starting master scheduler...\n');

  // ── SIGNAL SCANS ──────────────────────────────────
  // London breakout: scan at 07:00, 08:00, 09:00 UTC
  cron.schedule('0 7 * * 1-5', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 8 * * 1-5', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 9 * * 1-5', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });

  // Crypto 4H ORB: 4-hour marks
  cron.schedule('0 5 * * *', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 9 * * *', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 13 * * *', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 17 * * *', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 21 * * *', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });

  // US Index 30min ORB: 14:30 UTC (US market open)
  cron.schedule('30 14 * * 1-5', async () => { try { await runSignalScan(); } catch (e) { console.error('Scheduler error:', e); } });

  console.log('   Signal scans: London 07-09, Crypto 4H, US Index 14:30');

  // ── MONITOR ACTIVE SIGNALS ────────────────────────
  cron.schedule('*/15 * * * *', async () => { try { await monitorActiveSignals(); } catch (e) { console.error('Scheduler error:', e); } });
  console.log('   Monitor active signals: every 15 min');

  // ── DAILY SUMMARY ─────────────────────────────────
  cron.schedule('0 21 * * *', async () => { try { await sendDailySummary(); } catch (e) { console.error('Scheduler error:', e); } });
  console.log('   Daily summary: 21:00 UTC');

  // ── WAITING POST (if no signals by 16:00) ────────
  cron.schedule('0 16 * * 1-5', async () => { try { await postWaitingIfNoSignals(); } catch (e) { console.error('Scheduler error:', e); } });
  console.log('   Waiting post: 16:00 UTC (if no signals)');

  // ── ENGAGEMENT BOT ────────────────────────────────
  cron.schedule('0 4 * * *', async () => { try { await runEngagement(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 8 * * *', async () => { try { await runEngagement(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 12 * * *', async () => { try { await runEngagement(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 16 * * *', async () => { try { await runEngagement(); } catch (e) { console.error('Scheduler error:', e); } });
  cron.schedule('0 20 * * *', async () => { try { await runEngagement(); } catch (e) { console.error('Scheduler error:', e); } });
  console.log('   Engagement: every 4 hours starting 04:00');

  // ── WEEKLY ROUTINE (Sunday 00:30 UTC) ────────────
  cron.schedule('30 0 * * 0', async () => { try { await runWeeklyRoutine(); } catch (e) { console.error('Scheduler error:', e); } });
  console.log('   Weekly meta-learning: Sunday 00:30 UTC');

  // ── CONTENT SCHEDULER (7 daily posts) ────────────
  startContentScheduler();

  console.log('\n✅ All schedulers active');
}
ENDOFFILE
