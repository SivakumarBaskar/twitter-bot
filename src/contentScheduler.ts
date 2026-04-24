// ════════════════════════════════════════════════════
// APEX BOT v7.0 — DAILY CONTENT SCHEDULER
// Posts different content categories to X at set times
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
import type { PriceData } from './types';

// ════════════════════════════════════════════════════
// SCHEDULE CONFIGURATION
// All times in UTC
// ════════════════════════════════════════════════════
interface ScheduleSlot {
  hour: number;
  minute: number;
  category: ContentCategory;
  label: string;
  cronExpr: string;
}

const dailySlots: ScheduleSlot[] = [
  {
    hour: 3,
    minute: 0,
    category: 'question',
    label: 'Out-of-the-box Question',
    cronExpr: '0 3 * * *',
  },
  {
    hour: 7,
    minute: 0,
    category: 'relatable',
    label: 'Non-Trading Relatable',
    cronExpr: '0 7 * * *',
  },
  {
    hour: 9,
    minute: 0,
    category: 'market_context',
    label: 'Morning Market Context',
    cronExpr: '0 9 * * *',
  },
  {
    hour: 12,
    minute: 0,
    category: 'educational',
    label: 'Midday Educational',
    cronExpr: '0 12 * * *',
  },
  {
    hour: 14,
    minute: 0,
    category: 'question',
    label: 'Afternoon Question',
    cronExpr: '0 14 * * *',
  },
  {
    hour: 18,
    minute: 0,
    category: 'meme',
    label: 'Evening Meme/Humor',
    cronExpr: '0 18 * * *',
  },
  {
    hour: 20,
    minute: 0,
    category: 'eod_recap',
    label: 'EOD Recap',
    cronExpr: '0 20 * * *',
  },
];

// ════════════════════════════════════════════════════
// BUILD TEMPLATE VARIABLES FROM LIVE DATA
// ════════════════════════════════════════════════════
function buildTemplateVars(priceMap?: Map<string, PriceData>): TemplateVars {
  const vars: TemplateVars = {
    asset: 'EURUSD',
    direction: 'LONG',
    entry: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    rr: '3.0',
    triggers: '',
    session: 'London',
    asset1: 'EURUSD',
    asset2: 'XAUUSD',
    signalsToday: 0,
    wins: 0,
    losses: 0,
  };

  if (priceMap && priceMap.size > 0) {
    // Get EURUSD data for context
    const eurusd = priceMap.get('EURUSD');
    const gbpusd = priceMap.get('GBPUSD');
    const xauusd = priceMap.get('XAUUSD');
    const btcusd = priceMap.get('BTCUSD');

    // Determine DXY bias from EURUSD
    if (eurusd) {
      if (eurusd.changePercent > 0.1) {
        vars.dxyBias = 'softening slightly';
        vars.asset1 = 'EURUSD';
      } else if (eurusd.changePercent < -0.1) {
        vars.dxyBias = 'strengthening slightly';
      } else {
        vars.dxyBias = 'flat';
      }
    }

    // Gold context
    if (xauusd) {
      vars.goldLevel = `$${xauusd.current.toFixed(0)}+ zone`;
      if (xauusd.changePercent > 0.2) {
        vars.goldBias = 'bullish';
      } else if (xauusd.changePercent < -0.2) {
        vars.goldBias = 'bearish';
      } else {
        vars.goldBias = 'neutral';
      }
      vars.asset2 = 'XAUUSD';
    }

    // Index bias
    const spx = priceMap.get('SPX500');
    const nas = priceMap.get('NAS100');
    if (spx && nas) {
      const idxAvgChange = (spx.changePercent + nas.changePercent) / 2;
      if (idxAvgChange > 0.3) {
        vars.indexBias = 'bullish, risk-on';
      } else if (idxAvgChange < -0.3) {
        vars.indexBias = 'bearish, risk-off';
      } else {
        vars.indexBias = 'mixed/choppy';
      }
    }

    // Crypto sentiment
    if (btcusd) {
      if (btcusd.changePercent > 1) {
        vars.cryptoSentiment = 'risk-on, BTC pushing higher';
      } else if (btcusd.changePercent < -1) {
        vars.cryptoSentiment = 'cautious, BTC under pressure';
      } else {
        vars.cryptoSentiment = 'neutral, BTC consolidating';
      }
    }

    // Pick two interesting assets for waiting/context posts
    const assets = Array.from(priceMap.keys());
    if (assets.length >= 2) {
      vars.asset1 = assets[0];
      vars.asset2 = assets[1];
    }
  }

  // Get today's signal stats
  try {
    vars.signalsToday = signalDB.countToday();
    const weekTrades = tradeDB.getLast7Days();
    vars.wins = weekTrades.filter(t => t.pnlPips > 0).length;
    vars.losses = weekTrades.filter(t => t.pnlPips <= 0).length;
    vars.totalPips = weekTrades.reduce((sum, t) => sum + t.pnlPips, 0);
  } catch {
    // Stats not available yet, use defaults
  }

  return vars;
}

// ════════════════════════════════════════════════════
// POST A CONTENT SLOT TO X
// ════════════════════════════════════════════════════
async function postContentSlot(slot: ScheduleSlot): Promise<boolean> {
  const startTime = Date.now();

  console.log(`\n📝 Content Slot: ${slot.label} (${slot.category})`);
  console.log(`   Time: ${new Date().toISOString()}`);

  try {
    // Fetch live price data for template vars
    let priceMap: Map<string, PriceData> | undefined;
    if (slot.category === 'market_context' || slot.category === 'eod_recap') {
      try {
        priceMap = await fetchAllPrices();
        console.log(`   Price data: ${priceMap.size} assets`);
      } catch (err) {
        console.log(`   Price fetch failed, using defaults`);
      }
    }

    // Build template variables
    const vars = buildTemplateVars(priceMap);

    // Get unique template
    const tweetText = getUniqueTemplate(slot.category, vars);

    if (!tweetText || tweetText.length === 0) {
      console.log(`   ❌ Empty template generated, skipping`);
      return false;
    }

    // Check tweet length (X limit is 280 characters)
    if (tweetText.length > 280) {
      console.log(`   ⚠️ Tweet too long (${tweetText.length} chars), truncating`);
      // Try to cut at last newline under 280
      const truncated = tweetText.substring(0, 277) + '...';
      // Use truncated version
    }

    const finalText = tweetText.length > 280
      ? tweetText.substring(0, 277) + '...'
      : tweetText;

    console.log(`   Tweet (${finalText.length} chars):`);
    console.log(`   "${finalText.substring(0, 80)}..."`);

    // Post to X via Puppeteer
    await launchBrowser();
    const loggedIn = await loginToX();

    if (!loggedIn) {
      console.log(`   ❌ Could not log into X`);
      await closeBrowser();
      return false;
    }

    const postUrl = await postTweet(finalText);
    await closeBrowser();

    if (postUrl) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   ✅ Posted to X in ${duration}s`);

      // Log the post for content learning
      logContentPost(slot.category, finalText, true);

      // Notify Telegram
      await sendTelegram({
        type: 'INFO',
        title: `📝 Content Posted: ${slot.label}`,
        body: `${finalText.substring(0, 200)}${finalText.length > 200 ? '...' : ''}`,
        timestamp: Date.now(),
      });

      return true;
    } else {
      console.log(`   ❌ Post failed`);
      logContentPost(slot.category, finalText, false);
      return false;
    }

  } catch (error) {
    console.error(`   ❌ Error posting ${slot.label}:`, error);
    eventDB.log('CONTENT_ERROR', `Failed to post ${slot.label}`, {
      error: String(error),
    });
    await closeBrowser();
    return false;
  }
}

// ════════════════════════════════════════════════════
// CONTENT POST LOGGING (for meta-learning)
// ════════════════════════════════════════════════════
interface ContentPostRecord {
  id: string;
  category: ContentCategory;
  text: string;
  postedAt: number;
  postedToX: boolean;
  likes: number;
  retweets: number;
  replies: number;
  bookmarks: number;
  impressions: number;
  engagementScore: number;
}

// In-memory storage for this session
// (persistent tracking via contentLearning.ts)
const sessionPosts: ContentPostRecord[] = [];

function logContentPost(
  category: ContentCategory,
  text: string,
  success: boolean
): void {
  const record: ContentPostRecord = {
    id: `content-${Date.now()}`,
    category,
    text: text.substring(0, 500), // Store first 500 chars
    postedAt: Date.now(),
    postedToX: success,
    likes: 0,
    retweets: 0,
    replies: 0,
    bookmarks: 0,
    impressions: 0,
    engagementScore: 0,
  };

  sessionPosts.push(record);

  // Also log to database event log
  eventDB.log('CONTENT_POST', `Posted ${category}`, {
    category,
    success,
    charCount: text.length,
  });
}

// Expose for contentLearning.ts to read
export function getSessionPosts(): ContentPostRecord[] {
  return [...sessionPosts];
}

export function getRecentPostsByCategory(
  category: ContentCategory,
  limit: number = 10
): ContentPostRecord[] {
  return sessionPosts
    .filter(p => p.category === category)
    .slice(-limit);
}

// ════════════════════════════════════════════════════
// WEEKLY INSIGHT POST (Special — uses meta-learning data)
// ════════════════════════════════════════════════════
async function postWeeklyInsight(): Promise<void> {
  console.log('\n📊 Posting weekly insight...');

  try {
    // Get meta-learning data
    const { runWeeklyAnalysis } = await import('./metaLearning');
    const metrics = await runWeeklyAnalysis();

    // Build vars from metrics
    const vars: TemplateVars = {
      asset: 'EURUSD',
      direction: 'LONG',
      entry: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      rr: metrics.avgRR.toFixed(1),
      triggers: '',
      session: 'Weekly',
      signalsToday: metrics.totalTrades,
      wins: metrics.wins,
      losses: metrics.losses,
      winRate: metrics.winRate,
      totalPips: Math.round(metrics.totalPips),
      avgRR: metrics.avgRR,
      bestAsset: Object.entries(metrics.byAsset)
        .sort(([, a], [, b]) => b.winRate - a.winRate)[0]?.[0] || 'N/A',
      worstAsset: Object.entries(metrics.byAsset)
        .sort(([, a], [, b]) => a.winRate - b.winRate)[0]?.[0] || 'N/A',
    };

    const tweetText = getUniqueTemplate('weekly_insight', vars);

    if (!tweetText) {
      console.log('   ❌ Could not generate weekly insight');
      return;
    }

    // Post to X
    await launchBrowser();
    const loggedIn = await loginToX();
    if (loggedIn) {
      const finalText = tweetText.length > 280
        ? tweetText.substring(0, 277) + '...'
        : tweetText;

      await postTweet(finalText);
      console.log('   ✅ Weekly insight posted to X');

      logContentPost('weekly_insight', tweetText, true);
    }

    await closeBrowser();

  } catch (error) {
    console.error('   ❌ Weekly insight error:', error);
    await closeBrowser();
  }
}

// ════════════════════════════════════════════════════
// JITTER: Add random delay to avoid exact-time posting
// ════════════════════════════════════════════════════
function addJitter(baseMs: number): number {
  // ±3 minutes random jitter
  const jitterMs = (Math.random() - 0.5) * 6 * 60 * 1000;
  return baseMs + jitterMs;
}

// ════════════════════════════════════════════════════
// START ALL CONTENT SCHEDULES
// ════════════════════════════════════════════════════
export function startContentScheduler(): void {
  console.log('📝 Starting content scheduler...');

  // Register each daily slot
  for (const slot of dailySlots) {
    // Add jitter to avoid bot-like exact timing
    const jitteredMinute = slot.minute + Math.floor(Math.random() * 5) - 2;
    const safeMinute = Math.max(0, Math.min(59, jitteredMinute));
    const cronExpr = `${safeMinute} ${slot.hour} * * *`;

    cron.schedule(cronExpr, async () => {
      console.log(`\n⏰ Scheduled content: ${slot.label}`);
      try {
        await postContentSlot(slot);
      } catch (error) {
        console.error(`Content slot error (${slot.label}):`, error);
      }
    });

    console.log(`   ${String(slot.hour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')} UTC → ${slot.label}`);
  }

  // Weekly insight — Sunday 00:00 UTC
  cron.schedule('0 0 * * 0', async () => {
    try {
      await postWeeklyInsight();
    } catch (error) {
      console.error('Weekly insight error:', error);
    }
  });
  console.log('   Sunday 00:00 UTC → Weekly Insight');

  console.log(`\n✅ Content scheduler started (${dailySlots.length} daily slots + 1 weekly)`);
}

// ════════════════════════════════════════════════════
// MANUAL POST (for testing or on-demand)
// ════════════════════════════════════════════════════
export async function postManualContent(
  category: ContentCategory,
  customVars?: Partial<TemplateVars>
): Promise<boolean> {
  const slot: ScheduleSlot = {
    hour: new Date().getUTCHours(),
    minute: new Date().getUTCMinutes(),
    category,
    label: `Manual: ${category}`,
    cronExpr: '',
  };

  let priceMap: Map<string, PriceData> | undefined;
  try {
    priceMap = await fetchAllPrices();
  } catch {
    // Use defaults
  }

  const baseVars = buildTemplateVars(priceMap);
  const vars = { ...baseVars, ...customVars };

  const pool = category === 'signal' ? null
    : category === 'waiting' ? null
    : category === 'market_context' ? null
    : category === 'eod_recap' ? null
    : category === 'weekly_insight' ? null
    : category === 'tp_hit' ? null
    : category === 'sl_hit' ? null
    : null;

  if (pool) {
    // Static templates (question, relatable, meme, educational)
    const tweetText = getUniqueTemplate(category, vars);
    if (!tweetText) return false;

    const finalText = tweetText.length > 280
      ? tweetText.substring(0, 277) + '...'
      : tweetText;

    await launchBrowser();
    const loggedIn = await loginToX();
    if (!loggedIn) { await closeBrowser(); return false; }

    const result = await postTweet(finalText);
    await closeBrowser();

    logContentPost(category, tweetText, !!result);
    return !!result;
  }

  // Dynamic templates need vars
  return postContentSlot(slot);
}

// ════════════════════════════════════════════════════
// POST WAITING IF NO SIGNALS TODAY
// ════════════════════════════════════════════════════
export async function postWaitingIfNoSignals(): Promise<void> {
  const signalsToday = signalDB.countToday();

  if (signalsToday === 0) {
    console.log('\n🔴 No signals today — posting waiting message');

    let priceMap: Map<string, PriceData> | undefined;
    try {
      priceMap = await fetchAllPrices();
    } catch {
      // Use defaults
    }

    const vars = buildTemplateVars(priceMap);
    const tweetText = getUniqueTemplate('waiting', vars);

    if (tweetText) {
      const finalText = tweetText.length > 280
        ? tweetText.substring(0, 277) + '...'
        : tweetText;

      try {
        await launchBrowser();
        const loggedIn = await loginToX();
        if (loggedIn) {
          await postTweet(finalText);
          logContentPost('waiting', tweetText, true);
          console.log('   ✅ Waiting post published');
        }
        await closeBrowser();
      } catch (error) {
        console.error('   ❌ Waiting post error:', error);
        await closeBrowser();
      }
    }
  }
}
