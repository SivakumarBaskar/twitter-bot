import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';
import { isCommentUnique } from './safetyLayer';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ model: config.gemini.model });

// ════════════════════════════════════════════════════
// FALLBACK COMMENTS (if Gemini fails)
// ════════════════════════════════════════════════════
const fallbackComments = {
  usdt: [
    "Love what you're doing for the community! 🙌",
    "This is amazing, appreciate the generosity! 💪",
    "Great initiative! Supporting from day one 🔥",
    "The community really appreciates this! 🚀",
    "Incredible giveaway! You're the best 🎯",
  ],
  metawin: [
    "MetaWin always comes through for the community! 🎰",
    "Best platform in the space, hands down 🏆",
    "Love being part of the MetaWin community! 🚀",
    "This is why MetaWin is number one 🔥",
    "MetaWin never disappoints! Amazing stuff 💎",
  ],
  moonpay: [
    "MoonPay making crypto accessible for everyone! 🌙",
    "This is what the crypto community needed! 🚀",
    "MoonPay always delivers for the community! 💪",
    "Incredible initiative from the MoonPay team! 🔥",
    "Supporting crypto adoption one giveaway at a time! 🎯",
  ],
  generic: [
    "What an amazing opportunity! Thank you 🙌",
    "This community is incredible! 🚀",
    "Appreciate the generosity! Count me in 🔥",
    "This is exactly what this space needs! 💪",
    "Incredible initiative! Thank you so much 🎯",
  ],
};

// ════════════════════════════════════════════════════
// GEMINI COMMENT GENERATION
// ════════════════════════════════════════════════════
export async function generateComment(params: {
  accountHandle: string;
  postText: string;
  commentType: 'usdt' | 'metawin' | 'moonpay' | 'generic';
  giveawayContext?: string;
}): Promise<string> {

  const { accountHandle, postText, commentType, giveawayContext } = params;

  // Try Gemini first
  try {
    const prompt = buildPrompt(accountHandle, postText, commentType, giveawayContext);
    const result = await model.generateContent(prompt);
    const comment = result.response.text().trim();

    // Validate comment
    if (comment && comment.length > 10 && comment.length < 240) {
      // Ensure uniqueness
      if (isCommentUnique(comment)) {
        return comment;
      }
      // If not unique, try one more time
      const result2 = await model.generateContent(prompt + ' Make it different from before.');
      const comment2 = result2.response.text().trim();
      if (comment2 && isCommentUnique(comment2)) {
        return comment2;
      }
    }
  } catch (error) {
    console.log('⚠️ Gemini unavailable, using fallback comment');
  }

  // Fallback to pre-written comments
  return getUniqueFallback(commentType);
}

// ════════════════════════════════════════════════════
// GEMINI PROMPT BUILDER
// ════════════════════════════════════════════════════
function buildPrompt(
  handle: string,
  postText: string,
  type: string,
  context?: string
): string {
  return `
You are a genuine crypto enthusiast replying to a giveaway tweet from @${handle}.

Tweet content: "${postText}"
${context ? `Context: ${context}` : ''}

Write a SHORT, GENUINE, ENTHUSIASTIC reply comment.

Rules:
- Maximum 200 characters
- Sound like a real excited person, NOT a bot
- Include 1-2 relevant emojis
- Be specific to the account/brand when possible
- Never mention you are a bot
- Never use generic phrases like "I would love to win"
- Sound natural and conversational
- Do NOT include any wallet addresses or usernames
- Just the excitement/comment portion only

Account context:
${type === 'metawin' ? '- MetaWin is a crypto gambling/gaming platform' : ''}
${type === 'moonpay' ? '- MoonPay is a crypto payment platform' : ''}
${type === 'usdt' ? '- This is a USDT/crypto giveaway' : ''}

Reply ONLY with the comment text, nothing else.
  `.trim();
}

// ════════════════════════════════════════════════════
// FALLBACK COMMENT SELECTOR
// ════════════════════════════════════════════════════
function getUniqueFallback(type: string): string {
  const pool = fallbackComments[type as keyof typeof fallbackComments]
    || fallbackComments.generic;

  // Shuffle and pick one not recently used
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const comment of shuffled) {
    if (isCommentUnique(comment)) {
      return comment;
    }
  }

  // Last resort — modify with random suffix
  const base = pool[Math.floor(Math.random() * pool.length)];
  return base;
}

// ════════════════════════════════════════════════════
// WALLET REPLY TEXT BUILDERS
// ════════════════════════════════════════════════════
export function buildUSDTReply(aiComment: string): string {
  return `${aiComment}

💳 ${config.wallets.usdt_erc20}`;
}

export function buildMetaWinReply(aiComment: string): string {
  return `${aiComment}

🎮 MetaWin ID: ${config.wallets.metawinId}`;
}

export function buildCryptoReply(
  aiComment: string,
  currency: 'BTC' | 'SOL' | 'UNKNOWN'
): string {
  if (currency === 'BTC') {
    return `${aiComment}

₿ ${config.wallets.btc}`;
  } else if (currency === 'SOL') {
    return `${aiComment}

◎ ${config.wallets.sol}`;
  } else {
    // Unknown — provide both BTC and SOL
    return `${aiComment}

₿ BTC: ${config.wallets.btc}
◎ SOL: ${config.wallets.sol}`;
  }
}

// ════════════════════════════════════════════════════
// DETECT CURRENCY FROM POST
// ════════════════════════════════════════════════════
export function detectCurrency(postText: string): 'BTC' | 'SOL' | 'UNKNOWN' {
  const lower = postText.toLowerCase();

  const btcKeywords = ['bitcoin', 'btc', '₿'];
  const solKeywords = ['solana', 'sol', '◎'];

  const hasBTC = btcKeywords.some(k => lower.includes(k));
  const hasSOL = solKeywords.some(k => lower.includes(k));

  if (hasBTC && !hasSOL) return 'BTC';
  if (hasSOL && !hasBTC) return 'SOL';

  return 'UNKNOWN';
}

// ════════════════════════════════════════════════════
// WEEKLY REPORT GENERATION (Gemini)
// ════════════════════════════════════════════════════
export async function generateWeeklyAnalysis(params: {
  totalTrades: number;
  winRate: number;
  topAsset: string;
  worstAsset: string;
  avgRR: number;
  totalPips: number;
  suggestions: string[];
}): Promise<string> {

  try {
    const prompt = `
You are an expert trading analyst reviewing a week of automated trading signals.

Performance data:
- Total trades: ${params.totalTrades}
- Win rate: ${params.winRate.toFixed(1)}%
- Best asset: ${params.topAsset}
- Worst asset: ${params.worstAsset}
- Average RR: ${params.avgRR.toFixed(2)}
- Total pips: ${params.totalPips}

Write a brief, professional weekly trading summary for posting on X (Twitter).
- Maximum 280 characters
- Include key stats
- Positive but honest tone
- Include relevant emojis
- End with relevant hashtags (#forex #crypto #trading)
- Make it engaging for followers

Reply with ONLY the tweet text.
    `.trim();

    const result = await model.generateContent(prompt);
    return result.response.text().trim();

  } catch {
    // Fallback weekly report
    return `📊 Weekly Trading Summary

✅ Win Rate: ${params.winRate.toFixed(0)}%
📈 Total Trades: ${params.totalTrades}
💰 Pips: ${params.totalPips > 0 ? '+' : ''}${params.totalPips}
⚡ Avg RR: ${params.avgRR.toFixed(1)}

Signals powered by APEX Hybrid Strategy
#forex #crypto #trading #signals`;
  }
}
