// ════════════════════════════════════════════════════
// APEX BOT v7.0 — ENGAGEMENT BOT
// Discovers bigger accounts in trading niche
// Posts thoughtful value-add replies
// ════════════════════════════════════════════════════

import cron from 'node-cron';
import {
  launchBrowser,
  loginToX,
  getRecentPosts,
  replyToTweet,
  likeTweet,
  closeBrowser,
} from './puppeteerEngine';
import { config } from './config';
import { dailyActionsDB, eventDB } from './database';
import { isSafeToAct, recordAction, getActionDelay, randomDelay, checkForWarnings } from './safetyLayer';
import { generateEngagementReply } from './growthPrompts';
import { sendTelegram } from './telegram';

// ════════════════════════════════════════════════════
// ENGAGEMENT TARGET ACCOUNTS
// Mix of forex, crypto, and trading psychology accounts
// These are well-known accounts that post educational content
// You should replace with accounts you actually want to engage with
// ════════════════════════════════════════════════════
const ENGAGEMENT_TARGETS: string[] = [
  // Price action / SMC educators
  'TheFakeTrader',
  'innercircletrader',
  'TraderSZ',
  'Justin_cho_',
  'jab_pattern',
  // Forex analysts
  'ForexLive',
  'FXCM',
  // Trading psychology
  'AdmiralMarkets',
  // Crypto analysis
  'CryptoCred',
  'AltcoinPsycho',
  // Add more as you discover them
];

// ════════════════════════════════════════════════════
// ENGAGEMENT SETTINGS
// ════════════════════════════════════════════════════
const ENGAGEMENT_CONFIG = {
  // How many targets to check per run
  targetsPerRun: 3,

  // How many recent posts to check per target
  postsPerTarget: 3,

  // Max replies per engagement run
  maxRepliesPerRun: 2,

  // Max engagement actions per day
  maxEngagementPerDay: 8,

  // Minimum hours since last reply to same account
  replyCooldownHours: 24,

  // Run schedule (every 4 hours)
  runCron: '0 */4 * * *',

  // Only engage during reasonable hours
  activeHoursStart: 8,   // 08:00 UTC
  activeHoursEnd: 22,     // 22:00 UTC
};

// ════════════════════════════════════════════════════
// TRACKING: Which accounts we've already replied to
// Prevents spamming the same accounts
// ════════════════════════════════════════════════════
interface EngagementRecord {
  handle: string;
  postId: string;
  repliedAt: number;
  replyText: string;
}

const recentEngagements: EngagementRecord[] = [];

function hasRecentlyRepliedTo(handle: string): boolean {
  const cutoff = Date.now() - (ENGAGEMENT_CONFIG.replyCooldownHours * 60 * 60 * 1000);
  return recentEngagements.some(
    r => r.handle.toLowerCase() === handle.toLowerCase() && r.repliedAt > cutoff
  );
}

function recordEngagement(handle: string, postId: string, replyText: string): void {
  recentEngagements.push({
    handle,
    postId,
    repliedAt: Date.now(),
    replyText: replyText.substring(0, 200),
  });

  // Keep only last 100 records to prevent memory bloat
  if (recentEngagements.length > 100) {
    recentEngagements.splice(0, recentEngagements.length - 100);
  }
}

// ════════════════════════════════════════════════════
// CHECK IF POST IS WORTH REPLYING TO
// We only reply to posts that have educational value
// Skip memes, RTs, and low-effort content
// ════════════════════════════════════════════════════
function isWorthReplying(postText: string): boolean {
  const lower = postText.toLowerCase();

  // Skip short posts (likely low effort)
  if (postText.length < 80) return false;

  // Skip pure RT chains
  if (lower.startsWith('rt ')) return false;

  // Skip giveaway/contest posts
  const skipKeywords = [
    'giveaway', 'winner', 'winning', 'tag 3 friends',
    'retweet to enter', 'follow to win', 'prize draw',
  ];
  if (skipKeywords.some(k => lower.includes(k))) return false;

  // Skip "good morning" / "gm" posts
  if (lower === 'gm' || lower === 'good morning' || lower === 'gn') return false;

  // Look for educational/analysis signals
  const goodSignals = [
    'setup', 'structure', 'break of', 'order block',
    'fair value', 'liquidity', 'support', 'resistance',
    'bias', 'trend', 'entry', 'stop loss', 'target',
    'pips', 'risk', 'reward', 'chart', 'analysis',
    'market', 'price action', 'forex', 'crypto',
    'btc', 'eurusd', 'xauusd', 'gold', 'indices',
    'psychology', 'discipline', 'patience',
    'lesson', 'mistake', 'learn',
  ];

  const matchCount = goodSignals.filter(s => lower.includes(s)).length;
  return matchCount >= 1;
}

// ════════════════════════════════════════════════════
// MAIN ENGAGEMENT RUN
// ════════════════════════════════════════════════════
export async function runEngagement(): Promise<void> {
  const hour = new Date().getUTCHours();

  // Only run during active hours
  if (hour < ENGAGEMENT_CONFIG.activeHoursStart || hour > ENGAGEMENT_CONFIG.activeHoursEnd) {
    console.log('🕒 Engagement: Outside active hours, skipping');
    return;
  }

  // Safety check
  if (!isSafeToAct()) {
    console.log('⚠️ Engagement: Daily action limit reached, skipping');
    return;
  }

  const engagementCount = getEngagementCountToday();
  if (engagementCount >= ENGAGEMENT_CONFIG.maxEngagementPerDay) {
    console.log(`⚠️ Engagement: Max ${ENGAGEMENT_CONFIG.maxEngagementPerDay} per day reached`);
    return;
  }

  console.log('\n💬 Starting engagement run...');
  console.log(`   Active targets: ${ENGAGEMENT_TARGETS.length}`);
  console.log(`   Already engaged today: ${engagementCount}/${ENGAGEMENT_CONFIG.maxEngagementPerDay}`);

  let repliesThisRun = 0;

  try {
    await launchBrowser();
    const loggedIn = await loginToX();

    if (!loggedIn) {
      console.log('❌ Could not log in for engagement');
      await closeBrowser();
      return;
    }

    // Shuffle targets to vary which ones we check
    const shuffled = [...ENGAGEMENT_TARGETS].sort(() => Math.random() - 0.5);
    const targetsToCheck = shuffled.slice(0, ENGAGEMENT_CONFIG.targetsPerRun);

    for (const handle of targetsToCheck) {
      // Check cooldown
      if (hasRecentlyRepliedTo(handle)) {
        console.log(`   ⏭️ ${handle}: In cooldown period, skipping`);
        continue;
      }

      if (repliesThisRun >= ENGAGEMENT_CONFIG.maxRepliesPerRun) {
        console.log(`   ✅ Max replies per run reached (${repliesThisRun})`);
        break;
      }

      console.log(`\n   👀 Checking @${handle}...`);

      try {
        // Get recent posts from this account
        const posts = await getRecentPosts(handle);
        console.log(`   Found ${posts.length} recent posts`);

        for (const post of posts) {
          if (repliesThisRun >= ENGAGEMENT_CONFIG.maxRepliesPerRun) break;

          // Check if worth replying
          if (!isWorthReplying(post.postText)) {
            console.log(`   ↳ Skipped (low value): "${post.postText.substring(0, 50)}..."`);
            continue;
          }

          console.log(`   ✓ Worth replying to: "${post.postText.substring(0, 60)}..."`);

          // Generate thoughtful reply using Gemini
          const replyText = await generateEngagementReply(
            handle,
            post.postText
          );

          if (!replyText) {
            console.log('   ❌ Could not generate reply');
            continue;
          }

          // Wait before replying (human-like)
          await randomDelay(8000, 20000);

          // Check for warnings before posting
          // (would need page reference, skip for now)

          // Post the reply
          const success = await replyToTweet(post.postUrl, replyText);

          if (success) {
            repliesThisRun++;
            recordAction();
            recordEngagement(handle, post.postId, replyText);

            console.log(`   ✅ Replied to @${handle}`);
            console.log(`   Reply: "${replyText.substring(0, 80)}..."`);

            // Notify Telegram
            await sendTelegram({
              type: 'INFO',
              title: `💬 Engagement Reply Posted`,
              body: `Replied to @${handle}\n\n"${replyText.substring(0, 150)}"`,
              timestamp: Date.now(),
            });

            // Wait between replies (important for safety)
            await randomDelay(30000, 60000);
          } else {
            console.log(`   ❌ Reply failed for @${handle}`);
          }
        }

        // Wait between targets
        await randomDelay(15000, 30000);

      } catch (error) {
        console.error(`   ❌ Error checking @${handle}:`, error);
        eventDB.log('ENGAGEMENT_ERROR', `Failed to check @${handle}`, {
          error: String(error),
        });
      }
    }

    console.log(`\n✅ Engagement run complete: ${repliesThisRun} replies posted`);
    console.log(`   Total engagement actions today: ${getEngagementCountToday()}`);

  } catch (error) {
    console.error('❌ Engagement run failed:', error);
    eventDB.log('ENGAGEMENT_ERROR', 'Run failed', { error: String(error) });
    await sendTelegram({
      type: 'ERROR',
      title: '❌ Engagement Run Failed',
      body: String(error),
      timestamp: Date.now(),
    });
  } finally {
    await closeBrowser();
  }
}

// ════════════════════════════════════════════════════
// ENGAGEMENT COUNT TRACKING
// ════════════════════════════════════════════════════
function getEngagementCountToday(): number {
  const today = new Date().toISOString().split('T')[0];
  return recentEngagements.filter(
    r => r.repliedAt && new Date(r.repliedAt).toISOString().split('T')[0] === today
  ).length;
}

// ════════════════════════════════════════════════════
// ADD NEW TARGET (called from Telegram command)
// ════════════════════════════════════════════════════
export function addEngagementTarget(handle: string): boolean {
  const clean = handle.replace('@', '').toLowerCase().trim();

  if (!clean) return false;

  // Check duplicate
  if (ENGAGEMENT_TARGETS.some(h => h.toLowerCase() === clean)) {
    console.log(`⚠️ ${clean} is already in targets list`);
    return false;
  }

  ENGAGEMENT_TARGETS.push(clean);
  console.log(`✅ Added @${clean} to engagement targets`);
  return true;
}

// ════════════════════════════════════════════════════
// LIST ALL TARGETS
// ════════════════════════════════════════════════════
export function listEngagementTargets(): string[] {
  return [...ENGAGEMENT_TARGETS];
}

// ════════════════════════════════════════════════════
// START ENGAGEMENT SCHEDULER
// ════════════════════════════════════════════════════
export function startEngagementScheduler(): void {
  console.log('💬 Starting engagement scheduler...');

  cron.schedule(ENGAGEMENT_CONFIG.runCron, async () => {
    try {
      await runEngagement();
    } catch (error) {
      console.error('Engagement scheduler error:', error);
    }
  });

  console.log(`   Schedule: Every 4 hours (${ENGAGEMENT_CONFIG.activeHoursStart}:00-${ENGAGEMENT_CONFIG.activeHoursEnd}:00 UTC)`);
  console.log(`   Targets: ${ENGAGEMENT_TARGETS.length} accounts`);
  console.log(`   Max per run: ${ENGAGEMENT_CONFIG.maxRepliesPerRun} replies`);
  console.log(`   Max per day: ${ENGAGEMENT_CONFIG.maxEngagementPerDay} actions`);
  console.log(`   Cooldown: ${ENGAGEMENT_CONFIG.replyCooldownHours}h between same-account replies`);
}
