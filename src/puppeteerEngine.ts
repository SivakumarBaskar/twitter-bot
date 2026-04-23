import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { config } from './config';
import { safeDelay, randomDelay, humanType } from './safetyLayer';
import { eventDB } from './database';

// Apply stealth plugin — hides bot fingerprints
puppeteer.use(StealthPlugin());

let browser: Browser | null = null;
let page: Page | null = null;
let isLoggedIn = false;

// ════════════════════════════════════════════════════
// BROWSER MANAGEMENT
// ════════════════════════════════════════════════════
export async function launchBrowser(): Promise<void> {
  try {
    console.log('🌐 Launching stealth browser...');

    browser = await puppeteer.launch({
      headless: config.puppeteer.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',      // Critical for 1GB RAM
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',                // Save memory
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--safebrowsing-disable-auto-update',
        '--js-flags=--max-old-space-size=512', // Limit JS heap
        '--memory-pressure-off',
        '--single-process',             // Save memory on 1GB VM
      ],
      defaultViewport: config.puppeteer.viewport,
    });

    page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(config.puppeteer.userAgent);

    // Block unnecessary resources to save memory + speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();

      // Block images, fonts, analytics (not needed for posting)
      if (
        ['image', 'font', 'media'].includes(resourceType) ||
        url.includes('google-analytics') ||
        url.includes('doubleclick') ||
        url.includes('facebook') ||
        url.includes('analytics')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Suppress console errors from X's JS
    page.on('console', () => {});
    page.on('pageerror', () => {});

    console.log('✅ Browser launched successfully');
    eventDB.log('BROWSER', 'Browser launched');

  } catch (error) {
    console.error('❌ Failed to launch browser:', error);
    throw error;
  }
}

// ════════════════════════════════════════════════════
// X LOGIN
// ════════════════════════════════════════════════════
export async function loginToX(): Promise<boolean> {
  if (!browser || !page) await launchBrowser();
  if (isLoggedIn) return true;

  try {
    console.log('🔐 Logging into X...');

    await page!.goto('https://twitter.com/i/flow/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await randomDelay(2000, 4000);

    // ── STEP 1: Enter Username ──────────────────────
    console.log('  → Entering username...');
    const usernameInput = await page!.waitForSelector(
      'input[autocomplete="username"]',
      { timeout: 15000 }
    );

    if (!usernameInput) throw new Error('Username input not found');

    await humanType(page!, 'input[autocomplete="username"]',
      config.x.username);
    await randomDelay(800, 1500);

    // Click Next button
    await page!.keyboard.press('Enter');
    await randomDelay(2000, 3500);

    // ── STEP 2: Check for unusual activity prompt ───
    const pageContent = await page!.content();

    if (pageContent.includes('Enter your phone') ||
        pageContent.includes('Enter your email') ||
        pageContent.includes('unusual activity')) {

      console.log('  → X asking for email verification...');

      // Find the text input for email
      const emailInput = await page!.$('input[data-testid="ocfEnterTextTextInput"]')
        || await page!.$('input[name="text"]');

      if (emailInput) {
        await humanType(page!, 'input[name="text"]',
          config.x.email);
        await randomDelay(800, 1500);
        await page!.keyboard.press('Enter');
        await randomDelay(2000, 3000);
      }
    }

    // ── STEP 3: Enter Password ──────────────────────
    console.log('  → Entering password...');
    const passwordInput = await page!.waitForSelector(
      'input[name="password"]',
      { timeout: 15000 }
    );

    if (!passwordInput) throw new Error('Password input not found');

    await humanType(page!, 'input[name="password"]',
      config.x.password);
    await randomDelay(800, 1500);

    await page!.keyboard.press('Enter');
    await randomDelay(4000, 6000);

    // ── STEP 4: Verify Login Success ────────────────
    const currentUrl = page!.url();
    const finalContent = await page!.content();

    if (currentUrl.includes('home') ||
        finalContent.includes('data-testid="primaryColumn"')) {
      isLoggedIn = true;
      console.log('✅ Successfully logged into X');
      eventDB.log('AUTH', 'Successfully logged into X');
      return true;
    }

    // ── STEP 5: Handle 2FA if needed ────────────────
    if (finalContent.includes('confirmation code') ||
        finalContent.includes('verification code')) {
      console.log('  → 2FA required — check Telegram for instructions');
      // Telegram notification handled by caller
      return false;
    }

    console.error('❌ Login failed — unexpected state');
    console.error('Current URL:', currentUrl);
    return false;

  } catch (error) {
    console.error('❌ Login error:', error);
    eventDB.log('ERROR', 'Login failed', { error: String(error) });
    return false;
  }
}

// ════════════════════════════════════════════════════
// NAVIGATE TO USER PROFILE
// ════════════════════════════════════════════════════
export async function navigateToProfile(handle: string): Promise<boolean> {
  if (!page) return false;

  try {
    await page.goto(`https://twitter.com/${handle}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await randomDelay(2000, 4000);
    return true;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════
// GET RECENT POSTS FROM PROFILE
// ════════════════════════════════════════════════════
export async function getRecentPosts(handle: string): Promise<Array<{
  postId: string;
  postUrl: string;
  postText: string;
}>> {
  if (!page) return [];

  try {
    await navigateToProfile(handle);

    // Wait for tweets to load
    await page.waitForSelector('[data-testid="tweet"]', {
      timeout: 15000
    });

    await randomDelay(1500, 3000);

    // Scroll slightly to load more tweets (human behavior)
    await page.evaluate(() => window.scrollBy(0, 300));
    await randomDelay(1000, 2000);

    // Extract tweet data
    const posts = await page.evaluate(() => {
      const tweets = document.querySelectorAll('[data-testid="tweet"]');
      const results: Array<{
        postId: string;
        postUrl: string;
        postText: string;
      }> = [];

      tweets.forEach((tweet) => {
        try {
          // Get tweet text
          const textEl = tweet.querySelector('[data-testid="tweetText"]');
          const text = textEl?.textContent || '';

          // Get tweet link (contains post ID)
          const timeEl = tweet.querySelector('time');
          const linkEl = timeEl?.closest('a');
          const href = linkEl?.getAttribute('href') || '';

          if (href && text) {
            const parts = href.split('/');
            const postId = parts[parts.length - 1];
            results.push({
              postId,
              postUrl: `https://twitter.com${href}`,
              postText: text,
            });
          }
        } catch {
          // Skip malformed tweets
        }
      });

      return results.slice(0, 10); // Last 10 posts
    });

    return posts;

  } catch (error) {
    console.error(`❌ Failed to get posts from @${handle}:`, error);
    return [];
  }
}

// ════════════════════════════════════════════════════
// POST A TWEET
// ════════════════════════════════════════════════════
export async function postTweet(text: string): Promise<string | null> {
  if (!page || !isLoggedIn) return null;

  try {
    // Navigate to home
    await page.goto('https://twitter.com/home', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await randomDelay(2000, 4000);

    // Click compose tweet box
    const tweetBox = await page.waitForSelector(
      '[data-testid="tweetTextarea_0"]',
      { timeout: 10000 }
    );
    if (!tweetBox) throw new Error('Tweet box not found');

    await tweetBox.click();
    await randomDelay(800, 1500);

    // Type tweet with human-like speed
    await humanType(page, '[data-testid="tweetTextarea_0"]', text);
    await randomDelay(1500, 3000);

    // Click Tweet button
    const tweetBtn = await page.waitForSelector(
      '[data-testid="tweetButtonInline"]',
      { timeout: 10000 }
    );
    if (!tweetBtn) throw new Error('Tweet button not found');

    await tweetBtn.click();
    await randomDelay(3000, 5000);

    // Get the URL of the posted tweet
    const currentUrl = page.url();
    console.log('✅ Tweet posted successfully');
    eventDB.log('TWEET', 'Tweet posted', { text: text.substring(0, 50) });

    return currentUrl;

  } catch (error) {
    console.error('❌ Failed to post tweet:', error);
    eventDB.log('ERROR', 'Failed to post tweet', { error: String(error) });
    return null;
  }
}

// ════════════════════════════════════════════════════
// REPLY TO A TWEET
// ════════════════════════════════════════════════════
export async function replyToTweet(
  postUrl: string,
  replyText: string
): Promise<boolean> {
  if (!page || !isLoggedIn) return false;

  try {
    // Navigate to the tweet
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await randomDelay(2000, 4000);

    // Scroll to see tweet (human behavior)
    await page.evaluate(() => window.scrollBy(0, 200));
    await randomDelay(1000, 2000);

    // Click reply button
    const replyBtn = await page.waitForSelector(
      '[data-testid="reply"]',
      { timeout: 10000 }
    );
    if (!replyBtn) throw new Error('Reply button not found');

    await replyBtn.click();
    await randomDelay(1500, 3000);

    // Type reply
    const replyBox = await page.waitForSelector(
      '[data-testid="tweetTextarea_0"]',
      { timeout: 10000 }
    );
    if (!replyBox) throw new Error('Reply box not found');

    await humanType(page, '[data-testid="tweetTextarea_0"]', replyText);
    await randomDelay(1500, 2500);

    // Submit reply
    const submitBtn = await page.waitForSelector(
      '[data-testid="tweetButton"]',
      { timeout: 10000 }
    );
    if (!submitBtn) throw new Error('Submit button not found');

    await submitBtn.click();
    await randomDelay(3000, 5000);

    console.log('✅ Reply posted successfully');
    eventDB.log('REPLY', 'Reply posted', { url: postUrl });
    return true;

  } catch (error) {
    console.error('❌ Failed to reply:', error);
    eventDB.log('ERROR', 'Failed to reply', { error: String(error) });
    return false;
  }
}

// ════════════════════════════════════════════════════
// LIKE A TWEET
// ════════════════════════════════════════════════════
export async function likeTweet(postUrl: string): Promise<boolean> {
  if (!page || !isLoggedIn) return false;

  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await randomDelay(2000, 4000);

    // Check if already liked
    const likeBtn = await page.$('[data-testid="like"]');
    if (!likeBtn) return false;

    await likeBtn.click();
    await randomDelay(1500, 3000);

    console.log('✅ Tweet liked');
    return true;

  } catch (error) {
    console.error('❌ Failed to like tweet:', error);
    return false;
  }
}

// ════════════════════════════════════════════════════
// RETWEET
// ════════════════════════════════════════════════════
export async function retweetPost(postUrl: string): Promise<boolean> {
  if (!page || !isLoggedIn) return false;

  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await randomDelay(2000, 4000);

    // Click retweet button
    const rtBtn = await page.waitForSelector(
      '[data-testid="retweet"]',
      { timeout: 10000 }
    );
    if (!rtBtn) return false;

    await rtBtn.click();
    await randomDelay(1000, 2000);

    // Confirm retweet in popup
    const confirmBtn = await page.waitForSelector(
      '[data-testid="retweetConfirm"]',
      { timeout: 5000 }
    );
    if (confirmBtn) {
      await confirmBtn.click();
    }

    await randomDelay(2000, 3500);
    console.log('✅ Retweeted successfully');
    return true;

  } catch (error) {
    console.error('❌ Failed to retweet:', error);
    return false;
  }
}

// ════════════════════════════════════════════════════
// QUOTE TWEET
// ════════════════════════════════════════════════════
export async function quoteTweet(
  postUrl: string,
  quoteText: string
): Promise<boolean> {
  if (!page || !isLoggedIn) return false;

  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await randomDelay(2000, 4000);

    // Click retweet button first
    const rtBtn = await page.waitForSelector(
      '[data-testid="retweet"]',
      { timeout: 10000 }
    );
    if (!rtBtn) return false;

    await rtBtn.click();
    await randomDelay(1000, 2000);

    // Click "Quote Tweet" option
    const quoteBtn = await page.waitForSelector(
      '[data-testid="quoteTweet"]',
      { timeout: 5000 }
    );
    if (!quoteBtn) return false;

    await quoteBtn.click();
    await randomDelay(1500, 3000);

    // Type quote text
    await humanType(page, '[data-testid="tweetTextarea_0"]', quoteText);
    await randomDelay(1500, 2500);

    // Submit
    const submitBtn = await page.waitForSelector(
      '[data-testid="tweetButton"]',
      { timeout: 10000 }
    );
    if (!submitBtn) return false;

    await submitBtn.click();
    await randomDelay(3000, 5000);

    console.log('✅ Quote tweet posted');
    return true;

  } catch (error) {
    console.error('❌ Failed to quote tweet:', error);
    return false;
  }
}

// ════════════════════════════════════════════════════
// BROWSER CLEANUP
// ════════════════════════════════════════════════════
export async function closeBrowser(): Promise<void> {
  try {
    if (page) {
      await page.close();
      page = null;
    }
    if (browser) {
      await browser.close();
      browser = null;
    }
    isLoggedIn = false;
    console.log('🔒 Browser closed');
  } catch (error) {
    console.error('Error closing browser:', error);
  }
}

export function getBrowserState(): {
  isRunning: boolean;
  isLoggedIn: boolean;
} {
  return {
    isRunning: !!browser,
    isLoggedIn,
  };
}
