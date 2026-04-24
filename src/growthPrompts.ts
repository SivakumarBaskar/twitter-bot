// ════════════════════════════════════════════════════
// APEX BOT v7.0 — GROWTH-OPTIMIZED PROMPTS
// Gemini prompts designed to maximize:
//   - Replies (conversation starters)
//   - Bookmarks (save-for-later signals)
//   - Engagement score overall
// ════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// ════════════════════════════════════════════════════
// ENGAGEMENT REPLY GENERATOR
// For replying to bigger accounts in trading niche
// Goal: Thoughtful value-add that starts conversation
// ════════════════════════════════════════════════════

export async function generateEngagementReply(
  targetHandle: string,
  postText: string
): Promise<string | null> {
  try {
    const prompt = `You are a knowledgeable forex/crypto trader named APEX replying to another trader's tweet.

The account @${targetHandle} posted this:
"${postText}"

Write a SHORT reply (max 200 characters) that:
- Adds genuine value or insight to their point
- Shows you understand price action / market structure
- Sounds like a real trader, not a bot
- Does NOT self-promote or mention your own account
- Does NOT use hashtags
- Does NOT say "great post" or "nice analysis" (too generic)
- Can respectfully disagree if their view is flawed
- Can ask a follow-up question to spark discussion

Start directly with your reply. No prefix like "Reply:" or "@".
Be specific to what they actually said, not generic trading advice.

If the post is about:
- A specific setup/entry → comment on the structure, not just "good luck"
- Market analysis → add one observation they might have missed
- Trading psychology → share a brief personal take
- A question they asked → answer it directly and concisely
- General opinion → agree, disagree, or add nuance`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    if (reply.length > 280) {
      // Cut to last sentence boundary under 200
      const cut = reply.substring(0, 197).lastIndexOf('.');
      return cut > 0 ? reply.substring(0, cut + 1) : reply.substring(0, 197) + '...';
    }

    return reply;
  } catch (error) {
    console.log('[GrowthPrompts] Reply generation error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// BOOKMARK-OPTIMIZED SIGNAL POST
// Signals that people want to save for later
// Key: Include exact levels people can reference later
// ════════════════════════════════════════════════════

export async function generateBookmarkOptimizedSignal(vars: {
  asset: string;
  direction: string;
  entry: string;
  stopLoss: string;
  tp1: string;
  tp2: string;
  rr: string;
  triggers: string;
  session: string;
  grade: string;
}): Promise<string | null> {
  try {
    const prompt = `You are APEX, a forex/crypto trading signal account. Write a signal tweet that traders would want to BOOKMARK for later reference.

Signal details:
- Asset: ${vars.asset}
- Direction: ${vars.direction}
- Entry: ${vars.entry}
- Stop Loss: ${vars.stopLoss}
- TP1: ${vars.tp1}
- TP2: ${vars.tp2}
- RR: 1:${vars.rr}
- Confluence: ${vars.triggers}
- Session: ${vars.session}
- Grade: ${vars.grade}

Rules for maximum bookmarks:
- Include the exact levels (entry, SL, TP1, TP2) in a scannable format
- Make it feel like a professional trade journal entry
- Add ONE insight about WHY this setup works (market structure reason)
- End with a note about what invalidates the trade (SL hunting pattern)
- Sprinkle 2-3 relevant emojis but don't overdo it
- Max 280 characters
- No hashtags (they hurt bookmark rate)
- No "Not financial advice" (everyone says this, it adds nothing)

The goal: A trader sees this, thinks "I need to watch this level", and bookmarks it.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] Signal optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// REPLY-OPTIMIZED SIGNAL POST
// Signals that get people replying
// Key: State a slightly controversial or debatable take
// ════════════════════════════════════════════════════

export async function generateReplyOptimizedSignal(vars: {
  asset: string;
  direction: string;
  entry: string;
  stopLoss: string;
  tp1: string;
  tp2: string;
  rr: string;
  triggers: string;
  session: string;
}): Promise<string | null> {
  try {
    const prompt = `You are APEX, a forex/crypto trading signal account. Write a signal tweet designed to get REPLIES.

Signal details:
- Asset: ${vars.asset}
- Direction: ${vars.direction}
- Entry: ${vars.entry}
- SL: ${vars.stopLoss}
- TP1: ${vars.tp1}
- TP2: ${vars.tp2}
- RR: 1:${vars.rr}
- Confluence: ${vars.triggers}
- Session: ${vars.session}

Rules for maximum replies:
- Include a slightly debatable or contrarian take
- Ask a specific question at the end (what do you think about this setup?)
- Make it feel like you're sharing your REAL thought process, not posting a signal card
- Show the levels clearly but frame it as "here's what I'm watching" not "here's what you should trade"
- Max 280 characters
- No hashtags

The goal: Someone reads it and has an opinion they want to share.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] Reply-optimized signal error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// QUESTION POST OPTIMIZED FOR REPLIES
// Questions that make people WANT to answer
// Key: Not generic, specific scenarios people have opinions on
// ════════════════════════════════════════════════════

export async function generateReplyOptimizedQuestion(): Promise<string | null> {
  const topics = [
    'waiting too long for a setup vs entering a B-grade setup',
    'scaling up after a winning streak vs staying conservative',
    'closing winners too early vs letting them run',
    'trading the same pair every day vs diversifying across 5+ pairs',
    'following someone else's signals vs trusting your own analysis',
    'taking a loss on a valid setup vs revenge trading to make it back',
    'backtesting for months vs going live immediately',
    'using fixed SL/TP vs managing trades manually',
    'trading during high-impact news vs waiting for calm after',
    'journaling every trade vs relying on memory',
    'strict risk management vs flexible position sizing',
    'trading only HTF setups vs also taking scalps',
    'having a trading mentor vs being self-taught',
    'showing your losses publicly vs only wins',
  ];

  const topic = topics[Math.floor(Math.random() * topics.length)];

  try {
    const prompt = `You are APEX a trading account. Write a SHORT tweet (max 240 characters) that asks a specific question about trading.

The topic is: ${topic}

Rules:
- Ask about a REAL dilemma traders face, not a generic question
- Frame it as YOUR personal experience or thought
- Don't be preachy or lecture-like
- Make it feel raw and honest
- End with a clear question that has no right answer
- Max 240 characters
- No hashtags
- No "What do you think?" (too generic, be specific)

The goal: Someone reads it and genuinely wants to share their answer because they've been in this exact situation.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text.substring(0, 240);
  } catch (error) {
    console.log('[GrowthPrompts] Question optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// EDUCATIONAL POST OPTIMIZED FOR BOOKMARKS
// Educational posts people save for reference
// Key: Actionable framework, not just theory
// ════════════════════════════════════════════════════

export async function generateBookmarkOptimizedEducational(
  topic?: string
): Promise<string | null> {
  const topics = topic
    ? [topic]
    : [
      'how to identify a valid order block in a downtrend',
      'the difference between a fake breakout and a real one',
      'why most traders fail at patience and how to fix it',
      'how to use fair value gaps on the 15-minute chart',
      'the only 3 candlestick patterns that actually work',
      'how institutional traders use liquidity sweeps',
      'why your win rate doesn\'t matter as much as you think',
      'how to combine multiple timeframes for entries',
      'the real reason most stop losses get hit',
    ];

  const chosen = topics[Math.floor(Math.random() * topics.length)];

  try {
    const prompt = `You are APEX, a trading educator. Write a SHORT educational tweet about: ${chosen}

Rules for maximum bookmarks:
- Start with a bold or surprising statement (not "In this thread I'll explain...")
- Give the actual framework in 3-4 bullet points or numbered steps
- Be specific, not vague ("use structure" is vague, "wait for retest of broken level" is specific)
- Include one counter-intuitive insight most traders don't know
- Make it feel like insider knowledge, not a textbook
- Max 280 characters
- No hashtags
- No "Thread 🧵" prefix (we're not posting threads)

The goal: A trader reads this and thinks "I'm saving this for my trading plan."`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] Educational optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// WAITING POST OPTIMIZED FOR ENGAGEMENT
// Waiting posts that resonate emotionally
// Key: Acknowledge the frustration, make it relatable
// ════════════════════════════════════════════════════

export async function generateEngagementOptimizedWaiting(
  asset1?: string,
  asset2?: string
): Promise<string | null> {
  const angles = [
    'the frustration of having discipline when everyone else seems to be in a trade',
    'watching a setup form perfectly while being too scared to enter',
    'the irony of preparing all day for a trade that never triggers',
    'how waiting actually feels like doing work when everyone thinks you\'re lazy',
    'the quiet confidence of not chasing',
  ];

  const angle = angles[Math.floor(Math.random() * angles.length)];

  try {
    const prompt = `You are APEX, a disciplined trader. Write a SHORT waiting post about ${angle}.

 ${asset1 ? `Context: Watching ${asset1}${asset2 ? ` and ${asset2}` : ''} for a clean setup.` : ''}

Rules:
- Make it feel emotional but not whiny
- Show that patience IS the strategy, not a weakness
- Relatable to experienced traders who know the struggle
- Short and punchy — fewer words = more impact
- Max 280 characters
- No hashtags
- 1-2 emojis maximum

The goal: A trader reads this and thinks "this is exactly how I feel right now" and likes or replies.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] Waiting optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// MEME POST OPTIMIZED FOR ENGAGEMENT
// Memes that get shared/replied to
// Key: Specific trading scenario, not generic "trading be like"
// ════════════════════════════════════════════════════

export async function generateEngagementOptimizedMeme(): Promise<string | null> {
  const scenarios = [
    'saying "one more candle" for the 10th time',
    'drawing perfect lines on the chart then price ignores all of them',
    'having the perfect analysis but entering at the wrong time anyway',
    'your alarm goes off for London open and you negotiate with yourself for 30 minutes',
    'the setup you didn't take was the winner, the one you took was the loser',
    'explaining your loss to someone who asked "how's trading going"',
    'the moment you realize your "edge" is just being less stupid than average',
  ];

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  try {
    const prompt = `You are APEX, a trader with self-awareness. Write a SHORT funny tweet about ${scenario}.

Rules:
- Write it like you're talking to yourself, not an audience
- Specific details, not generic trading memes
- Self-deprecating humor, not "relatable trading meme #47"
- Punchy first line that hooks immediately
- Max 280 characters
- No hashtags
- 1-2 emojis
- The funnier and more specific, the better

The goal: Another trader reads it and replies "literally me rn 😂"`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] Meme optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// EOD RECAP OPTIMIZED FOR ENGAGEMENT
// End of day posts that start conversation
// Key: Ask a question, show vulnerability
// ════════════════════════════════════════════════════

export async function generateEngagementOptimizedEOD(vars: {
  signalsToday: number;
  wins: number;
  losses: number;
  asset1?: string;
  asset2?: string;
}): Promise<string | null> {
  try {
    const prompt = `You are APEX, a trading bot account. Write a SHORT end-of-day post.

Today's stats:
- Signals: ${vars.signalsToday}
- Wins: ${vars.wins}
- Losses: ${vars.losses}
- Watching: ${vars.asset1 || 'EURUSD'} and ${vars.asset2 || 'XAUUSD'}

Rules:
- Don't just report numbers — add one honest reflection
- If no trades: talk about the patience struggle today
- If had trades: share what you learned
- End with a question for your audience
- Sound human, not like a bot reporting stats
- Max 280 characters
- No hashtags

The goal: A follower reads it and wants to share how their day went too.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] EOD optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// MARKET CONTEXT OPTIMIZED FOR ENGAGEMENT
// Market updates that people reply to
// Key: State a bold take, not just "DXY is up, Gold is down"
// ════════════════════════════════════════════════════

export async function generateEngagementOptimizedContext(vars: {
  dxyBias?: string;
  goldLevel?: string;
  goldBias?: string;
  indexBias?: string;
  asset1?: string;
  asset2?: string;
}): Promise<string | null> {
  try {
    const prompt = `You are APEX, a trader with opinions. Write a SHORT market context tweet.

Market data:
- DXY: ${vars.dxyBias || 'flat'}
- Gold: ${vars.goldLevel || 'holding key levels'} (${vars.goldBias || 'neutral'})
- Indices: ${vars.indexBias || 'mixed'}
- Watching: ${vars.asset1 || 'EURUSD'} and ${vars.asset2 || 'XAUUSD'}

Rules:
- Have a BOLD take on what's happening, not just reporting data
- Say something slightly contrarian if justified
- Make a specific prediction or call-out
- Short and direct
- Max 280 characters
- No hashtags

The goal: Someone disagrees with your take and replies to argue their point.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().substring(0, 280);
  } catch (error) {
    console.log('[GrowthPrompts] Context optimization error:', error);
    return null;
  }
}

// ════════════════════════════════════════════════════
// FALLBACK REPLIES (when Gemini fails)
// Always have backups ready
// ════════════════════════════════════════════════════
const fallbackEngagementReplies = [
  "Interesting take on the structure here. Have you checked if the 4H close confirmed the BOS or is it still a pending break?",
  "The retest is the real entry, not the initial break. How long do you usually wait for the pullback?",
  "Good observation. What timeframe are you watching for the OB retest — 15min or 1H?",
  "I see the same pattern forming. The question is whether this is a real sweep or accumulation before the real move.",
  "This is why I only trade London + NY overlap. Asian range is the setup, London break is the trigger. Patience pays.",
  "Respect the discipline of waiting for A+ only. Most losses come from B-grade entries that 'looked close enough'.",
];

export function getFallbackEngagementReply(): string {
  return fallbackEngagementReplies[
    Math.floor(Math.random() * fallbackEngagementReplies.length)
  ];
}
