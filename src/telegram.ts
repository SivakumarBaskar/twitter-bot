import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { signalDB, tradeDB, giveawayDB,
         dailyActionsDB, eventDB } from './database';
import { getSafetyStatus } from './safetyLayer';
import type { TelegramMessage } from './types';

// ════════════════════════════════════════════════════
// BOT INITIALIZATION
// ════════════════════════════════════════════════════
const bot = new TelegramBot(config.telegram.token, { polling: true });
const CHAT_ID = config.telegram.chatId;

console.log('✅ Telegram bot initialized');

// ════════════════════════════════════════════════════
// SEND MESSAGE
// ════════════════════════════════════════════════════
export async function sendTelegram(msg: TelegramMessage): Promise<void> {
  try {
    const text = formatMessage(msg);
    await bot.sendMessage(CHAT_ID, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

function formatMessage(msg: TelegramMessage): string {
  const time = new Date(msg.timestamp).toUTCString();
  return `*${msg.title}*\n\n${msg.body}\n\n_${time}_`;
}

// ════════════════════════════════════════════════════
// COMMAND HANDLERS
// ════════════════════════════════════════════════════

// /start — Welcome message
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const welcome = `
🤖 *APEX Bot Control Panel*

Available commands:

📊 *Trading*
/status — Bot status overview
/signals — Active signals
/performance — Win rate & stats
/assets — All monitored assets

🎁 *Giveaway*
/giveaway — Recent giveaway activity
/safety — Safety & action limits

⚙️ *Control*
/pause — Pause signal generation
/resume — Resume signal generation
/report — Generate weekly report now

💰 *Info*
/wallets — Display wallet addresses
/help — Show this menu
  `.trim();

  await bot.sendMessage(CHAT_ID, welcome, { parse_mode: 'Markdown' });
});

// /status — Full bot status
bot.onText(/\/status/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const activeSignals = signalDB.getActive();
  const todaySignals = signalDB.countToday();
  const winRate = tradeDB.getWinRate();
  const safety = getSafetyStatus();
  const giveawayToday = giveawayDB.getTodayCount();

  const status = `
📊 *APEX Bot Status*

*Trading Bot (Oracle):*
Status: ✅ Running 24/7
Signals today: ${todaySignals}/${config.strategy.maxSignalsPerDay}
Active positions: ${activeSignals.length}
30-day win rate: ${winRate.toFixed(1)}%

*Giveaway Bot (GitHub):*
Status: ✅ Runs every 30 min
Actions today: ${giveawayToday}/20
Accounts monitored: 4

*Safety:*
Actions today: ${safety.actionsToday}/20
Safe to act: ${safety.safeToAct ? '✅ Yes' : '⚠️ No'}

*Active Signals:*
${activeSignals.length === 0 ? 'None currently' :
  activeSignals.map(s =>
    `• ${s.symbol} ${s.direction} @ ${s.entry} [${s.status}]`
  ).join('\n')}
  `.trim();

  await bot.sendMessage(CHAT_ID, status, { parse_mode: 'Markdown' });
});

// /signals — Active signals detail
bot.onText(/\/signals/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const signals = signalDB.getActive();

  if (signals.length === 0) {
    await bot.sendMessage(CHAT_ID, '📊 No active signals currently.');
    return;
  }

  for (const signal of signals) {
    const text = `
*${signal.displayName} — ${signal.direction}*

Entry: \`${signal.entry}\`
Stop Loss: \`${signal.stopLoss}\`
TP1: \`${signal.tp1}\`
TP2: \`${signal.tp2}\`
RR: ${signal.rrRatio}:1
Confluence: ${'⭐'.repeat(signal.confluenceScore)} ${signal.confluenceScore}/5
Session: ${signal.session}
Status: ${signal.status}
Posted to X: ${signal.postedToX ? '✅' : '⏳'}
    `.trim();

    await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
    await new Promise(r => setTimeout(r, 500));
  }
});

// /performance — Stats
bot.onText(/\/performance/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const trades7d = tradeDB.getLast7Days();
  const trades30d = tradeDB.getLast30Days();

  const wins7d = trades7d.filter(t => t.pnlPips > 0).length;
  const wins30d = trades30d.filter(t => t.pnlPips > 0).length;
  const pips7d = trades7d.reduce((s, t) => s + t.pnlPips, 0);
  const pips30d = trades30d.reduce((s, t) => s + t.pnlPips, 0);

  const perf = `
📈 *Performance Stats*

*Last 7 Days:*
Trades: ${trades7d.length}
Wins: ${wins7d} | Losses: ${trades7d.length - wins7d}
Win Rate: ${trades7d.length > 0 ? ((wins7d/trades7d.length)*100).toFixed(1) : 0}%
Total Pips: ${pips7d > 0 ? '+' : ''}${pips7d.toFixed(1)}

*Last 30 Days:*
Trades: ${trades30d.length}
Wins: ${wins30d} | Losses: ${trades30d.length - wins30d}
Win Rate: ${trades30d.length > 0 ? ((wins30d/trades30d.length)*100).toFixed(1) : 0}%
Total Pips: ${pips30d > 0 ? '+' : ''}${pips30d.toFixed(1)}

🧠 Meta-learning: Active
Parameters auto-adjust weekly
  `.trim();

  await bot.sendMessage(CHAT_ID, perf, { parse_mode: 'Markdown' });
});

// /giveaway — Giveaway activity
bot.onText(/\/giveaway/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const recent = giveawayDB.getRecent(5);
  const todayCount = giveawayDB.getTodayCount();

  let text = `🎁 *Giveaway Activity*\n\nEntered today: ${todayCount}\n\nRecent:\n`;

  if (recent.length === 0) {
    text += 'No giveaways detected recently';
  } else {
    text += recent.map(g =>
      `• @${g.account_handle} — ${g.replied ? '✅ Replied' : '⏳ Pending'}\n  ${g.post_url}`
    ).join('\n');
  }

  await bot.sendMessage(CHAT_ID, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });
});

// /wallets — Display wallet addresses
bot.onText(/\/wallets/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const wallets = `
💰 *Wallet Addresses*

*USDT (ERC20):*
\`${config.wallets.usdt_erc20}\`

*Bitcoin (BTC):*
\`${config.wallets.btc}\`

*Solana (SOL):*
\`${config.wallets.sol}\`

*MetaWin ID:*
\`${config.wallets.metawinId}\`
  `.trim();

  await bot.sendMessage(CHAT_ID, wallets, { parse_mode: 'Markdown' });
});

// /safety — Safety status
bot.onText(/\/safety/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const safety = getSafetyStatus();

  const text = `
🛡️ *Safety Status*

Actions today: ${safety.actionsToday}/20
Under limit: ${safety.isUnderLimit ? '✅' : '⚠️ LIMIT REACHED'}
Safe to act: ${safety.safeToAct ? '✅ Yes' : '❌ No'}
Reasonable hour: ${safety.reasonableHour ? '✅ Yes' : '⚠️ Off hours'}

Auto-safety measures:
✅ Random delays between actions
✅ Human-like typing speed
✅ Daily action cap (20/day)
✅ Warning detection active
✅ Unique comments (Gemini)
✅ Duplicate post prevention
  `.trim();

  await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
});

// /assets — All assets
bot.onText(/\/assets/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const text = `
📊 *Monitored Assets (13 total)*

*FX Majors:*
EUR/USD, GBP/USD, USD/JPY
AUD/USD, USD/CAD, USD/CHF

*Crypto:*
BTC/USD (Binance) ✅
ETH/USD (Binance) ✅
SOL/USD (Binance) ✅

*Indices:*
S&P 500, NASDAQ 100

*Commodities:*
Gold/USD, Silver/USD

Price Sources:
A: Twelve Data
B: Binance (crypto)
C: Yahoo Finance (fallback)
  `.trim();

  await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
});

// /report — Manual weekly report
bot.onText(/\/report/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  await bot.sendMessage(CHAT_ID,
    '🧠 Generating weekly report... (takes 30 seconds)');

  // Import and run
  const { runWeeklyAnalysis, adjustParameters,
          generateAndSendWeeklyReport } = await import('./metaLearning');
  const metrics = await runWeeklyAnalysis();
  await adjustParameters(metrics);
  await generateAndSendWeeklyReport(metrics);
});

// /help
bot.onText(/\/help/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  // Trigger /start
  await bot.emit('message', { ...msg, text: '/start' });
});

// ════════════════════════════════════════════════════
// ERROR HANDLER
// ════════════════════════════════════════════════════
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error.message);
});

export default bot;
