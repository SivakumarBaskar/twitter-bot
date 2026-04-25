// ════════════════════════════════════════════════════
// APEX BOT — GitHub Actions Runner
// Called by workflows with: npx ts-node src/run.ts <job>
// Each job runs, does its work, exits cleanly.
// ════════════════════════════════════════════════════

import dotenv from 'dotenv';
dotenv.config();

import { initDatabase } from './database';
import { sendTelegram } from './telegram';
import { eventDB } from './database';

const job = process.argv[2];

if (!job) {
  console.log('Usage: npx ts-node src/run.ts <job>');
  console.log('Jobs: scanner, content, engage, signal, post');
  process.exit(1);
}

async function main() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`APEX BOT — Job: ${job}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(50)}\n`);

  initDatabase();

  switch (job) {
    case 'scanner': {
      const { runScanner } = await import('./scanner');
      await runScanner();
      break;
    }

    case 'content': {
      const cat = process.argv[3]; // optional: category override
      const { postManualContent, postWaitingIfNoSignals } = await import('./contentScheduler');
      if (cat) {
        await postManualContent(cat as any);
      } else {
        await postWaitingIfNoSignals();
      }
      break;
    }

    case 'engage': {
      const { runEngagementCycle } = await import('./engagementBot');
      await runEngagementCycle();
      break;
    }

    case 'signal': {
      // Manual signal from trigger text
      const signalText = process.argv[3] || '';
      if (!signalText) {
        console.log('Usage: npx ts-node src/run.ts signal "BUY EURUSD 1.0850 1.0820 1.0890 1.0925 3.2 BOS+OB London"');
        break;
      }
      // Parse and post as signal
      const { postTweet, launchBrowser, loginToX, closeBrowser } = await import('./puppeteerEngine');
      await launchBrowser();
      await loginToX();
      await postTweet(signalText);
      await closeBrowser();
      break;
    }

    case 'post': {
      const text = process.argv[3] || '';
      if (!text) {
        console.log('Usage: npx ts-node src/run.ts post "Your tweet text"');
        break;
      }
      const { postTweet, launchBrowser, loginToX, closeBrowser } = await import('./puppeteerEngine');
      await launchBrowser();
      await loginToX();
      await postTweet(text);
      await closeBrowser();
      break;
    }

    default:
      console.log(`Unknown job: ${job}`);
  }

  console.log(`\n✅ Job "${job}" complete\n`);
}

main().catch(async (err) => {
  console.error('❌ Job failed:', err);
  try {
    await sendTelegram({
      type: 'ERROR',
      title: `Job Failed: ${job}`,
      body: String(err),
      timestamp: Date.now(),
    });
  } catch { /* telegram also failed */ }
  process.exit(1);
});
