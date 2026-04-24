cat > src/contentScheduler.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — DAILY CONTENT SCHEDULER
// ════════════════════════════════════════════════════

import cron from 'node-cron';
import {
  getUniqueTemplate,
  type ContentCategory,
  type TemplateVars,
} from './templates';
import { config } from './config';
import {
  launchBrowser,
  loginToX,
  postTweet,
  closeBrowser,
} from './puppeteerEngine';
import { fetchAllPrices } from './priceMonitor';
import { signalDB, tradeDB, eventDB } from './database';
import { sendTelegram } from './telegram';
import { logContentPost } from './contentLearning';
import type { PriceData } from './types';

// ════════════════════════════════════════════════════
// SCHEDULE
// ════════════════════════════════════════════════════
const dailySlots = [
  { hour: 3,  minute: 0, category: 'question' as ContentCategory,       label: 'Question' },
  { hour: 7,  minute: 0, category: 'relatable' as ContentCategory,      label: 'Relatable' },
  { hour: 9,  minute: 0, category: 'market_context' as ContentCategory, label: 'Market Context' },
  { hour: 12, minute: 0, category: 'educational' as ContentCategory,    label: 'Educational' },
  { hour: 14, minute: 0, category: 'question' as ContentCategory,       label: 'Afternoon Question' },
  { hour: 18, minute: 0, category: 'meme' as ContentCategory,          label: 'Meme' },
  { hour: 20, minute: 0, category: 'eod_recap' as ContentCategory,      label: 'EOD Recap' },
];

// ════════════════════════════════════════════════════
// BUILD TEMPLATE VARS FROM LIVE DATA
// ════════════════════════════════════════════════════
function buildTemplateVars(priceMap?: Map<string, PriceData>): TemplateVars {
  const vars: TemplateVars = {
    asset: 'EURUSD', direction: 'LONG', entry: 0,
    stopLoss: 0, tp1: 0, tp2: 0, rr: '0',
    triggers: '', session: '', asset1: 'EURUSD', asset2: 'XAUUSD',
    signalsToday: 0, wins: 0, losses: 0,
  };

  if (priceMap && priceMap.size > 0) {
    const eurusd = priceMap.get('EURUSD');
    const xauusd = priceMap.get('XAUUSD');
    const btcusd = priceMap.get('BTCUSD');
    const spx = priceMap.get('SPX500');
    const nas = priceMap.get('NAS100');

    vars.dxyBias = eurusd
      ? (eurusd.changePercent > 0.1 ? 'softening' : eurusd.changePercent < -0.1 ? 'strengthening' : 'flat')
      : 'flat';

    if (xauusd) {
      vars.goldLevel = `$${xauusd.current.toFixed(0)}`;
      vars.goldBias = xauusd.changePercent > 0.2 ? 'bullish' : xauusd.changePercent < -0.2 ? 'bearish' : 'neutral';
      vars.asset2 = 'XAUUSD';
    }

    if (spx && nas) {
      const avg = (spx.changePercent + nas.changePercent) / 2;
      vars.indexBias = avg > 0.3 ? 'bullish' : avg < -0.3 ? 'bearish' : 'mixed';
    }

    if (btcusd) {
      vars.cryptoSentiment = btcusd.changePercent > 1 ? 'risk-on' : btcusd.changePercent < -1 ? 'cautious' : 'neutral';
    }
  }

  try {
    vars.signalsToday = signalDB.countToday();
    const week = tradeDB.getLast7Days();
    vars.wins = week.filter(t => t.pnlPips > 0).length;
    vars.losses = week.filter(t => t.pnlPips <= 0).length;
    vars.totalPips = Math.round(week.reduce((s, t) => s + t.pnlPips, 0));
  } catch { /* defaults */ }

  return vars;
}

// ════════════════════════════════════════════════════
// POST A CONTENT SLOT
// ════════════════════════════════════════════════════
async function postContentSlot(
  hour: number,
  minute: number,
  category: ContentCategory,
  label: string
): Promise<boolean> {
  console.log(`\n📝 Content: ${label} (${category})`);

  try {
    let priceMap: Map<string, PriceData> | undefined;
    if (['market_context', 'eod_recap', 'waiting'].includes(category)) {
      try { priceMap = await fetchAllPrices(); } catch { /* defaults */ }
    }

    const vars = buildTemplateVars(priceMap);
    const tweetText = getUniqueTemplate(category, vars);

    if (!tweetText) {
      console.log('   ❌ No template generated');
      return false;
    }

    const finalText = tweetText.length > 280
      ? tweetText.substring(0, 277) + '...'
      : tweetText;

    await launchBrowser();
    const loggedIn = await loginToX();

    if (!loggedIn) {
      console.log('   ❌ Login failed');
      await closeBrowser();
      logContentPost(category, finalText, false);
      return false;
    }

    const url = await postTweet(finalText);
    await closeBrowser();

    const success = !!url;
    logContentPost(category, finalText, success);

    if (success) {
      console.log(`   ✅ Posted: "${finalText.substring(0, 60)}..."`);
      await sendTelegram({
        type: 'INFO',
        title: `📝 ${label}`,
        body: finalText.substring(0, 200),
        timestamp: Date.now(),
      });
    } else {
      console.log('   ❌ Post failed');
    }

    return success;
  } catch (error) {
    console.error(`   ❌ Error:`, error);
    eventDB.log('CONTENT_ERROR', `Failed: ${label}`, { error: String(error) });
    try { await closeBrowser(); } catch {}
    return false;
  }
}

// ════════════════════════════════════════════════════
// POST WAITING IF NO SIGNALS
// ════════════════════════════════════════════════════
export async function postWaitingIfNoSignals(): Promise<void> {
  if (signalDB.countToday() === 0) {
    console.log('\n🔴 No signals — posting waiting message');
    let priceMap: Map<string, PriceData> | undefined;
    try { priceMap = await fetchAllPrices(); } catch {}
    const vars = buildTemplateVars(priceMap);
    const text = getUniqueTemplate('waiting', vars);
    if (text) {
      const finalText = text.length > 280 ? text.substring(0, 277) + '...' : text;
      try {
        await launchBrowser();
        const loggedIn = await loginToX();
        if (loggedIn) {
          await postTweet(finalText);
          logContentPost('waiting', finalText, true);
          console.log('   ✅ Waiting post published');
        }
        await closeBrowser();
      } catch { try { await closeBrowser(); } catch {} }
    }
  }
}

// ════════════════════════════════════════════════════
// MANUAL POST (for Telegram command)
// ════════════════════════════════════════════════════
export async function postManualContent(
  category: ContentCategory,
  customVars?: Partial<TemplateVars>
): Promise<boolean> {
  let priceMap: Map<string, PriceData> | undefined;
  try { priceMap = await fetchAllPrices(); } catch {}
  const vars = { ...buildTemplateVars(priceMap), ...customVars };
  return postContentSlot(
    new Date().getUTCHours(),
    new Date().getUTCMinutes(),
    category,
    `Manual: ${category}`
  );
}

// ════════════════════════════════════════════════════
// START CONTENT SCHEDULER
// ════════════════════════════════════════════════════
export function startContentScheduler(): void {
  console.log('📝 Starting content scheduler...');

  for (const slot of dailySlots) {
    const jitter = Math.floor(Math.random() * 5) - 2;
    const safeMin = Math.max(0, Math.min(59, slot.minute + jitter));

    cron.schedule(`${safeMin} ${slot.hour} * * *`, async () => {
      try {
        await postContentSlot(slot.hour, safeMin, slot.category, slot.label);
      } catch (error) {
        console.error(`Content error (${slot.label}):`, error);
      }
    });

    console.log(`   ${String(slot.hour).padStart(2, '0')}:${String(safeMin).padStart(2, '0')} UTC → ${slot.label}`);
  }

  console.log(`✅ Content scheduler: ${dailySlots.length} daily slots`);
}
ENDOFFILE
