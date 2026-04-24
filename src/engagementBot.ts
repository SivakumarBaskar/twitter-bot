cat > src/engagementBot.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — ENGAGEMENT BOT
// Browses timeline, likes/replies to relevant posts
// Runs every 4 hours via scheduler
// ════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';
import {
  launchBrowser,
  loginToX,
  closeBrowser,
  getRecentPosts,
  likeTweet,
  replyToTweet,
} from './puppeteerEngine';
import { sendTelegram } from './telegram';
import { eventDB, dailyActionsDB } from './database';
import { CONTENT_PROMPTS } from './growthPrompts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Accounts to engage with (trading/finance accounts)
const TARGET_ACCOUNTS = [
  'ChartClub_', 'tradernutz', 'TheLunduke',
  'FXCeil', 'Tradiing psicology', 'KingOfForex_',
];

const MAX_LIKES_PER_RUN = 3;
const MAX_REPLIES_PER_RUN = 1;

// ════════════════════════════════════════════════════
// MAIN ENGAGEMENT RUN
// ════════════════════════════════════════════════════
export async function runEngagement(): Promise<void> {
  if (!dailyActionsDB.isUnderLimit()) {
    console.log('⏸️ Engagement skipped — daily action limit reached');
    return;
  }

  console.log('\n💬 Running engagement cycle...');

  try {
    await launchBrowser();
    const loggedIn = await loginToX();

    if (!loggedIn) {
      console.log('   ❌ Could not log into X');
      await closeBrowser();
      return;
    }

    let likesDone = 0;
    let repliesDone = 0;

    // Pick 2 random target accounts
    const targets = shuffleArray(TARGET_ACCOUNTS).slice(0, 2);

    for (const handle of targets) {
      if (likesDone >= MAX_LIKES_PER_RUN && repliesDone >= MAX_REPLIES_PER_RUN) break;

      try {
        const posts = await getRecentPosts(handle);
        if (!posts || posts.length === 0) continue;

        // Like up to 2 posts from this account
        for (const post of posts.slice(0, 2)) {
          if (likesDone >= MAX_LIKES_PER_RUN) break;
          if (!dailyActionsDB.isUnderLimit()) break;

          try {
            const liked = await likeTweet(post.url);
            if (liked) {
              likesDone++;
              dailyActionsDB.increment();
              console.log(`   👍 Liked: ${post.url}`);
              await randomDelay(3000, 6000);
            }
          } catch {
            // Skip failed likes
          }
        }

        // Reply to 1 post from this account
        if (repliesDone < MAX_REPLIES_PER_RUN && dailyActionsDB.isUnderLimit()) {
          const targetPost = posts[0];
          try {
            const replyText = await generateEngagementReply(targetPost.text);
            if (replyText) {
              const replied = await replyToTweet(targetPost.url, replyText);
              if (replied) {
                repliesDone++;
                dailyActionsDB.increment();
                console.log(`   💬 Replied to: ${targetPost.url}`);
                await randomDelay(4000, 8000);
              }
            }
          } catch {
            // Skip failed replies
          }
        }

      } catch (error) {
        console.error(`   ⚠️ Error engaging with @${handle}:`, error);
      }
    }

    await closeBrowser();

    console.log(`   ✅ Engagement done: ${likesDone} likes, ${repliesDone} replies`);

    if (likesDone > 0 || repliesDone > 0) {
      await sendTelegram({
        type: 'INFO',
        title: '💬 Engagement Cycle',
        body: `Liked ${likesDone} posts, replied ${repliesDone} times.`,
        timestamp: Date.now(),
      });
    }

    eventDB.log('ENGAGEMENT', `Cycle complete`, {
      likes: likesDone,
      replies: repliesDone,
    });

  } catch (error) {
    console.error('   ❌ Engagement error:', error);
    await closeBrowser();
  }
}

// ════════════════════════════════════════════════════
// GENERATE ENGAGEMENT REPLY VIA GEMINI
// ════════════════════════════════════════════════════
async function generateEngagementReply(postText: string): Promise<string | null> {
  try {
    const prompt = CONTENT_PROMPTS.engagement_reply + `\n\nPost: "${postText.substring(0, 300)}"`;
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim().replace(/^["']|["']$/g, '');

    if (reply && reply.length > 10 && reply.length < 220) {
      return reply;
    }
    return null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}
ENDOFFILE
