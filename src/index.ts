cat > src/index.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — MAIN ENTRY POINT
// ════════════════════════════════════════════════════

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import { initDatabase, eventDB } from './database';
import { startScheduler } from './scheduler';
import { sendTelegram } from './telegram';

function ensureDirectories(): void {
  for (const dir of ['./data', './logs']) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created: ${dir}`);
    }
  }
}

function validateEnv(): void {
  const required = [
    'X_USERNAME', 'X_EMAIL', 'X_PASSWORD',
    'TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID',
    'GEMINI_API_KEY', 'TWELVE_DATA_KEY',
    'WALLET_USDT_ERC20', 'WALLET_BTC',
    'WALLET_SOL', 'METAWIN_ID',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:');
    missing.forEach(k => console.error(`   - ${k}`));
    process.exit(1);
  }
  console.log('✅ Environment validated');
}

function setupShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n⚠️ ${signal} — shutting down...`);
    eventDB.log('SHUTDOWN', `Signal: ${signal}`);
    try {
      await sendTelegram({
        type: 'INFO',
        title: '⚠️ Bot Shutting Down',
        body: `${signal}. PM2 will restart if configured.`,
        timestamp: Date.now(),
      });
    } catch {}
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught exception:', error);
    eventDB.log('ERROR', 'Uncaught exception', { error: String(error) });
    try {
      await sendTelegram({
        type: 'ERROR',
        title: '💥 Bot Crashed',
        body: `${error.message}\nPM2 will restart.`,
        timestamp: Date.now(),
      });
    } catch {}
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('💥 Unhandled rejection:', reason);
    eventDB.log('ERROR', 'Unhandled rejection', { reason: String(reason) });
  });
}

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       APEX HYBRID BOT v7.0            ║');
  console.log('║   Trading · Content · Meta-Learning   ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('\n');

  ensureDirectories();
  validateEnv();
  setupShutdown();

  console.log('💾 Initializing database...');
  initDatabase();

  // Start Telegram polling (import triggers it)
  await import('./telegram');
  console.log('📱 Telegram polling started');

  // Start all schedulers
  startScheduler();

  // Startup notification
  await sendTelegram({
    type: 'INFO',
    title: '🚀 APEX Bot Started',
    body: 'All systems online.\n\n✅ Signals: London Breakout + 4H ORB + 30min ORB\n✅ Content: 7 daily posts\n✅ Meta-learning: Active\n✅ Engagement: Every 4 hours\n\nUse /status to check.',
    timestamp: Date.now(),
  });

  console.log('\n✅ APEX Bot fully started');
  console.log('📱 Check Telegram for confirmation\n');
}

main().catch(error => {
  console.error('❌ Fatal startup error:', error);
  process.exit(1);
});
ENDOFFILE
