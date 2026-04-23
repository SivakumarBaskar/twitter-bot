import type { Page } from 'puppeteer';
import { dailyActionsDB } from './database';
import { config } from './config';

// ════════════════════════════════════════════════════
// HUMAN-LIKE DELAYS
// ════════════════════════════════════════════════════

// Fixed delay
export function safeDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Random delay between min and max ms
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ════════════════════════════════════════════════════
// HUMAN-LIKE TYPING
// ════════════════════════════════════════════════════
export async function humanType(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  // Click field first
  await page.click(selector);
  await randomDelay(300, 700);

  // Type character by character with random speed
  for (const char of text) {
    await page.type(selector, char, {
      delay: Math.floor(
        Math.random() *
        (config.puppeteer.typingDelayMax - config.puppeteer.typingDelayMin) +
        config.puppeteer.typingDelayMin
      ),
    });

    // Occasional longer pause (thinking)
    if (Math.random() < 0.05) {
      await randomDelay(300, 800);
    }
  }
}

// ════════════════════════════════════════════════════
// ACTION RATE LIMITING
// ════════════════════════════════════════════════════

// Check if safe to perform another action today
export function isSafeToAct(): boolean {
  if (!dailyActionsDB.isUnderLimit()) {
    console.log('⚠️ Daily action limit reached — skipping');
    return false;
  }
  return true;
}

// Record an action was taken
export function recordAction(): void {
  dailyActionsDB.increment();
}

// Get delay between actions (longer = safer)
export function getActionDelay(): number {
  const count = dailyActionsDB.getCount();

  // Progressive slowdown as action count increases
  if (count < 5) {
    return Math.floor(Math.random() * 30000) + 30000;  // 30-60 sec
  } else if (count < 10) {
    return Math.floor(Math.random() * 60000) + 60000;  // 1-2 min
  } else {
    return Math.floor(Math.random() * 120000) + 120000; // 2-4 min
  }
}

// ════════════════════════════════════════════════════
// HUMAN BEHAVIOR SIMULATION
// ════════════════════════════════════════════════════

// Simulate mouse movement (before clicking)
export async function humanMouseMove(page: Page): Promise<void> {
  const x = Math.floor(Math.random() * 800) + 200;
  const y = Math.floor(Math.random() * 400) + 100;
  await page.mouse.move(x, y, { steps: 10 });
  await randomDelay(200, 500);
}

// Human-like scroll
export async function humanScroll(page: Page): Promise<void> {
  const scrollAmount = Math.floor(Math.random() * 300) + 100;
  await page.evaluate((amount) => {
    window.scrollBy({
      top: amount,
      behavior: 'smooth',
    });
  }, scrollAmount);
  await randomDelay(500, 1500);
}

// ════════════════════════════════════════════════════
// SUSPICIOUS ACTIVITY DETECTION
// ════════════════════════════════════════════════════
export async function checkForWarnings(page: Page): Promise<{
  hasWarning: boolean;
  type: string;
}> {
  try {
    const content = await page.content();
    const url = page.url();

    // Check for various X warning/block pages
    if (url.includes('suspended')) {
      return { hasWarning: true, type: 'SUSPENDED' };
    }

    if (content.includes('Your account has been locked')) {
      return { hasWarning: true, type: 'LOCKED' };
    }

    if (content.includes('Verify your identity') ||
        content.includes('confirm your identity')) {
      return { hasWarning: true, type: 'VERIFY' };
    }

    if (content.includes('something went wrong') &&
        content.includes('Try again')) {
      return { hasWarning: true, type: 'ERROR' };
    }

    if (content.includes('rate limit') ||
        content.includes('too many requests')) {
      return { hasWarning: true, type: 'RATE_LIMIT' };
    }

    return { hasWarning: false, type: 'NONE' };

  } catch {
    return { hasWarning: false, type: 'NONE' };
  }
}

// ════════════════════════════════════════════════════
// SESSION TIMING (Don't act at exact same times)
// ════════════════════════════════════════════════════

// Add jitter to scheduled times (±5 minutes)
export function addTimeJitter(scheduledMs: number): number {
  const jitterMs = (Math.random() - 0.5) * 10 * 60 * 1000; // ±5 min
  return scheduledMs + jitterMs;
}

// Check if current time is within reasonable hours
// (Don't act at 3am = looks more bot-like)
export function isReasonableHour(): boolean {
  const hour = new Date().getUTCHours();
  // Allow 6am-11pm UTC (roughly normal hours worldwide)
  return hour >= 6 && hour <= 23;
}

// ════════════════════════════════════════════════════
// COMMENT VARIATION (Never post same text twice)
// ════════════════════════════════════════════════════

const usedComments = new Set<string>();

export function isCommentUnique(comment: string): boolean {
  const normalized = comment.toLowerCase().trim();
  if (usedComments.has(normalized)) return false;
  usedComments.add(normalized);
  return true;
}

// ════════════════════════════════════════════════════
// SAFETY REPORT
// ════════════════════════════════════════════════════
export function getSafetyStatus(): {
  actionsToday: number;
  actionLimit: number;
  isUnderLimit: boolean;
  safeToAct: boolean;
  reasonableHour: boolean;
} {
  const actionsToday = dailyActionsDB.getCount();
  return {
    actionsToday,
    actionLimit: 20,
    isUnderLimit: actionsToday < 20,
    safeToAct: isSafeToAct() && isReasonableHour(),
    reasonableHour: isReasonableHour(),
  };
}
