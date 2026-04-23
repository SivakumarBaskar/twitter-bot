import dotenv from 'dotenv';
dotenv.config();

import { initDatabase } from './database';
import { startScheduler } from './scheduler';
import { sendTelegram } from './telegram';
import { eventDB } from './database';
import fs from 'fs';
import path from 'path';

// ════════════════════════════════════════════════════
// ENSURE DIRECTORIES EXIST
// ════════════════════════════════════════════════════
function ensureDirectories(): void {
  const dirs = ['./data', './logs'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });
}

// ════════════════════════════════════════════════════
// VALIDATE ENVIRONMENT
// ════════════════════════════════════════════════════
function validateEnv(): void {
  const required = [
    'X_USERNAME', 'X_EMAIL', 'X_PASSWORD',
    'TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID',
    'GEMINI_API_KEY', 'TWELVE_DATA_KEY',
    'WALLET_USDT_ERC20', 'WALLET_BTC',
    'WALLET_SOL', 'METAWIN_ID',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  console.log('✅ Environment variables validated');
}

// ════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ════════════════════════════════════════════════════
function setupShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n⚠️ ${signal} received — shutting down gracefully...`);

    try {
      await sendTelegram({
        type: 'INFO',
        title: '⚠️ Bot Shutting Down',
        body: `Received ${signal} signal. Bot stopping gracefully.`,
        timestamp: Date.now(),
      });
    } catch {
      // Ignore telegram error on shutdown
    }

    eventDB.log('SHUTDOWN', `Bot stopped: ${signal}`);
    console.log('✅ Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught exception:', error);
    eventDB.log('ERROR', 'Uncaught exception', { error: String(error) });

    try {
      await sendTelegram({
        type: 'ERROR',
        title: '💥 Bot Crashed',
        body: `Uncaught exception: ${error.message}\n\nBot will restart automatically via PM2.`,
        timestamp: Date.now(),
      });
    } catch {
      // Ignore
    }

    process.exit(1);
  });
}

// ════════════════════════════════════════════════════
// MAIN STARTUP
// ════════════════════════════════════════════════════
async function main(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║      APEX HYBRID BOT v1.0.0           ║');
  console.log('║      Trading + Giveaway + Meta-AI     ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('\n');

  // Setup
  ensureDirectories();
  validateEnv();
  setupShutdown();

  // Initialize database
  console.log('💾 Initializing database...');
  initDatabase();

  // Import telegram to start polling
  await import('./telegram');

  // Start all scheduled jobs
  startScheduler();

  // Send startup notification
  await sendTelegram({
    type: 'INFO',
    title: '🚀 APEX Bot Started',
    body: `Bot is now running on Oracle Cloud.

✅ Trading bot: Active
✅ Signal scanning: Every 4 hours
✅ Trade monitoring: Every 15 min
✅ Giveaway bot: GitHub Actions
✅ Meta-learning: Weekly Sunday
✅ Telegram: Connected

Use /status to check bot status
Use /help for all commands`,
    timestamp: Date.now(),
  });

  console.log('\n✅ APEX Bot fully started and running!');
  console.log('📱 Check your Telegram for confirmation');
  console.log('💬 Use /status to check bot status\n');
}

main().catch(error => {
  console.error('❌ Fatal startup error:', error);
  process.exit(1);
});
