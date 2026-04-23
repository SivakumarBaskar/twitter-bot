import { config } from './config';
import type { GiveawayAccount } from './types';
import {
  buildUSDTReply,
  buildMetaWinReply,
  buildCryptoReply,
  generateComment,
  detectCurrency,
} from './commentGen';

// ════════════════════════════════════════════════════
// GIVEAWAY DETECTION
// ════════════════════════════════════════════════════
export function isGiveawayPost(
  postText: string,
  account: GiveawayAccount
): boolean {
  const lower = postText.toLowerCase();

  // Must contain at least 2 keywords to avoid false positives
  const matchedKeywords = account.keywords.filter(kw =>
    lower.includes(kw.toLowerCase())
  );

  if (matchedKeywords.length < 1) return false;

  // Additional validation — must look like a real giveaway
  const giveawaySignals = [
    lower.includes('winner'),
    lower.includes('win'),
    lower.includes('giveaway'),
    lower.includes('giving'),
    lower.includes('free'),
    lower.includes('drop'),
    lower.includes('enter'),
    lower.includes('prize'),
    lower.includes('contest'),
    lower.includes('airdrop'),
    // Amount indicators
    /\$[\d,]+/.test(postText),
    /[\d,]+ (usdt|btc|eth|sol|usd)/i.test(postText),
  ];

  const signalCount = giveawaySignals.filter(Boolean).length;
  return signalCount >= 2;
}

// ════════════════════════════════════════════════════
// BUILD REPLY PER ACCOUNT
// ════════════════════════════════════════════════════
export async function buildReplyForAccount(
  account: GiveawayAccount,
  postText: string,
  postHandle: string
): Promise<string> {

  const commentType = account.replyTemplate as
    'usdt' | 'metawin' | 'moonpay' | 'generic';

  // Generate unique AI comment
  const aiComment = await generateComment({
    accountHandle: postHandle,
    postText,
    commentType,
  });

  switch (account.replyType) {

    case 'USDT_ADDRESS':
      return buildUSDTReply(aiComment);

    case 'METAWIN_ID':
      return buildMetaWinReply(aiComment);

    case 'CRYPTO_ADDRESS': {
      const currency = detectCurrency(postText);
      return buildCryptoReply(aiComment, currency);
    }

    default:
      return buildMetaWinReply(aiComment);
  }
}

// ════════════════════════════════════════════════════
// GET ACCOUNT CONFIG BY HANDLE
// ════════════════════════════════════════════════════
export function getAccountConfig(
  handle: string
): GiveawayAccount | null {
  return config.giveawayAccounts.find(
    a => a.handle.toLowerCase() === handle.toLowerCase()
  ) || null;
}

// ════════════════════════════════════════════════════
// DETERMINE ACTIONS FOR ACCOUNT
// ════════════════════════════════════════════════════
export interface ActionPlan {
  shouldLike: boolean;
  shouldRetweet: boolean;
  shouldReply: boolean;
  shouldQuote: boolean;
  replyText: string;
  quoteText?: string;
}

export async function buildActionPlan(
  account: GiveawayAccount,
  postText: string,
  postUrl: string
): Promise<ActionPlan> {

  const replyText = await buildReplyForAccount(
    account,
    postText,
    account.handle
  );

  // Build quote text for MetaWin (they want quote retweet)
  let quoteText: string | undefined;
  if (account.actions.includes('quote')) {
    const aiComment = await generateComment({
      accountHandle: account.handle,
      postText,
      commentType: account.replyTemplate as any,
    });
    quoteText = `${aiComment}\n\n🎮 My MetaWin ID: ${config.wallets.metawinId}`;
  }

  return {
    shouldLike: account.actions.includes('like'),
    shouldRetweet: account.actions.includes('retweet') &&
                   !account.actions.includes('quote'), // RT OR quote, not both
    shouldReply: account.actions.includes('reply'),
    shouldQuote: account.actions.includes('quote'),
    replyText,
    quoteText,
  };
}
