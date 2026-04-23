import { config } from './config';
import { giveawayDB, dailyActionsDB, eventDB } from './database';
import {
  launchBrowser,
  loginToX,
  getRecentPosts,
  replyToTweet,
  likeTweet,
  retweetPost,
  quoteTweet,
  closeBrowser,
  getBrowserState,
} from './puppeteerEngine';
import {
  isSafeToAct,
  recordAction,
  getActionDelay,
  checkForWarnings,
  getSafetyStatus,
  randomDelay,
} from './safetyLayer';
import { isGiveawayPost, getAccountConfig, buildActionPlan } from './accountRules';
import { sendTelegram } from './telegram';
import type { GiveawayPost } from './types';
import { v4 as uuid } from 'crypto';

// ════════════════════════════════════════════════════
// MAIN GIVEAWAY CHECK (called by GitHub Actions)
// ════════════════════════════════════════════════════
export async function runGiveawayCheck(): Promise<void> {
  console.log('\n🎁 Starting giveaway check...');
  console.log('Time:', new Date().toISOString());

  const safety = getSafetyStatus();
  console.log('Safety status:', safety);

  if (!safety.isUnderLimit) {
    console.log('⚠️ Daily action limit reached. Skipping run.');
    return;
  }

  let actionsThisRun = 0;
  const maxActionsThisRun = config.x.maxActionsPerRun;

  try {
    // Launch browser and login
    await launchBrowser();
    const loggedIn = await loginToX();

    if (!loggedIn) {
      await sendTelegram({
        type: 'ERROR',
        title: '⚠️ Giveaway Bot Login Failed',
        body: 'Could not log into X. Check credentials or if X is asking for verification.',
        timestamp: Date.now(),
      });
      await closeBrowser();
      return;
    }

    console.log('✅ Logged in, checking accounts...\n');

    // Check each giveaway account
    for (const account of config.giveawayAccounts) {
      if (actionsThisRun >= maxActionsThisRun) {
        console.log(`⚠️ Max actions per run reached (${maxActionsThisRun})`);
        break;
      }

      console.log(`\n👀 Checking @${account.handle}...`);

      try {
        // Get recent posts from this account
        const posts = await getRecentPosts(account.handle);
        console.log(`   Found ${posts.length} recent posts`);

        for (const post of posts) {
          // Skip if already processed
          if (giveawayDB.hasProcessed(post.postId)) {
            continue;
          }

          // Check if it's a giveaway
          if (!isGiveawayPost(post.postText, account)) {
            // Save as non-giveaway to avoid re-checking
            giveawayDB.save({
              id: generateId(),
              accountHandle: account.handle,
              postId: post.postId,
              postUrl: post.postUrl,
              postText: post.postText,
              detectedAt: Date.now(),
              isGiveaway: false,
              replyType: account.replyType,
              replied: false,
              liked: false,
              retweeted: false,
              quoted: false,
              aiComment: '',
            });
            continue;
          }

          console.log(`\n🎉 GIVEAWAY DETECTED from @${account.handle}!`);
          console.log(`   Post: ${post.postUrl}`);
          console.log(`   Text: ${post.postText.substring(0, 100)}...`);

          // Check safety before acting
          if (!isSafeToAct()) {
            console.log('⚠️ Not safe to act right now');
            break;
          }

          // Build action plan
          const plan = await buildActionPlan(account, post.postText, post.postUrl);
          console.log('   Action plan:', {
            like: plan.shouldLike,
            retweet: plan.shouldRetweet,
            reply: plan.shouldReply,
            quote: plan.shouldQuote,
          });

          // Save giveaway record
          const giveawayRecord: GiveawayPost = {
            id: generateId(),
            accountHandle: account.handle,
            postId: post.postId,
            postUrl: post.postUrl,
            postText: post.postText,
            detectedAt: Date.now(),
            isGiveaway: true,
            replyType: account.replyType,
            replied: false,
            liked: false,
            retweeted: false,
            quoted: false,
            aiComment: plan.replyText,
          };

          // Notify Telegram
          await sendTelegram({
            type: 'GIVEAWAY',
            title: `🎁 Giveaway Detected — @${account.handle}`,
            body: `Post: ${post.postUrl}\n\nText: ${post.postText.substring(0, 200)}\n\nActing on it now...`,
            timestamp: Date.now(),
          });

          // Execute actions with delays
          let actionSuccess = false;

          // 1. Like
          if (plan.shouldLike && actionsThisRun < maxActionsThisRun) {
            console.log('   ❤️ Liking post...');
            await randomDelay(2000, 5000);
            const liked = await likeTweet(post.postUrl);
            if (liked) {
              giveawayRecord.liked = true;
              recordAction();
              actionsThisRun++;
            }
          }

          // Delay between actions
          await randomDelay(getActionDelay() / 10, getActionDelay() / 5);

          // 2. Retweet (if not quoting)
          if (plan.shouldRetweet && actionsThisRun < maxActionsThisRun) {
            console.log('   🔄 Retweeting...');
            await randomDelay(3000, 7000);
            const retweeted = await retweetPost(post.postUrl);
            if (retweeted) {
              giveawayRecord.retweeted = true;
              recordAction();
              actionsThisRun++;
            }
          }

          // 3. Quote Tweet
          if (plan.shouldQuote && plan.quoteText &&
              actionsThisRun < maxActionsThisRun) {
            console.log('   💬 Quote tweeting...');
            await randomDelay(5000, 10000);
            const quoted = await quoteTweet(post.postUrl, plan.quoteText);
            if (quoted) {
              giveawayRecord.quoted = true;
              recordAction();
              actionsThisRun++;
              actionSuccess = true;
            }
          }

          // 4. Reply
          if (plan.shouldReply && actionsThisRun < maxActionsThisRun) {
            console.log('   💬 Replying...');
            console.log('   Reply text:', plan.replyText.substring(0, 80));
            await randomDelay(8000, 15000); // Longer delay before reply
            const replied = await replyToTweet(post.postUrl, plan.replyText);
            if (replied) {
              giveawayRecord.replied = true;
              giveawayRecord.repliedAt = Date.now();
              recordAction();
              actionsThisRun++;
              actionSuccess = true;
            }
          }

          // Save updated record
          giveawayDB.save(giveawayRecord);

          if (actionSuccess) {
            console.log(`✅ Successfully acted on @${account.handle} giveaway`);
            await sendTelegram({
              type: 'GIVEAWAY',
              title: `✅ Giveaway Entry Complete`,
              body: `@${account.handle}\n\nActions: ${[
                giveawayRecord.liked ? 'Liked ❤️' : '',
                giveawayRecord.retweeted ? 'Retweeted 🔄' : '',
                giveawayRecord.replied ? 'Replied 💬' : '',
                giveawayRecord.quoted ? 'Quoted 🔁' : '',
              ].filter(Boolean).join(', ')}\n\nPost: ${post.postUrl}`,
              timestamp: Date.now(),
            });
          }

          // Delay before next giveaway
          await randomDelay(15000, 30000);
        }

      } catch (error) {
        console.error(`❌ Error checking @${account.handle}:`, error);
        eventDB.log('ERROR', `Giveaway check failed for @${account.handle}`,
          { error: String(error) });
      }

      // Delay between accounts
      await randomDelay(10000, 20000);
    }

  } catch (error) {
    console.error('❌ Giveaway check failed:', error);
    await sendTelegram({
      type: 'ERROR',
      title: '❌ Giveaway Bot Error',
      body: String(error),
      timestamp: Date.now(),
    });
  } finally {
    await closeBrowser();
    console.log('\n✅ Giveaway check complete');
    console.log(`Actions taken this run: ${actionsThisRun}`);
    console.log(`Total actions today: ${dailyActionsDB.getCount()}`);
  }
}

// ════════════════════════════════════════════════════
// STANDALONE MODE (for GitHub Actions)
// ════════════════════════════════════════════════════
const isStandalone = process.argv.includes('--standalone');
if (isStandalone) {
  runGiveawayCheck()
    .then(() => {
      console.log('✅ Standalone giveaway run complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Standalone run failed:', err);
      process.exit(1);
    });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
