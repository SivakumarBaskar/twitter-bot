cat > src/growthPrompts.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — GROWTH & CONTENT PROMPTS
// Gemini prompts for content generation
// ════════════════════════════════════════════════════

export const CONTENT_PROMPTS = {
  question: `Write a short trading-related question for Twitter/X that gets high engagement.
Rules: max 200 chars, conversational tone, no hashtags, end with ?, no quotation marks.
Just the question text only.`,

  relatable: `Write a short relatable trading moment for Twitter/X that traders will laugh at.
Rules: max 240 chars, funny but not self-deprecating, use 1-2 emojis, no hashtags.
Just the text only.`,

  educational: `Write a short trading tip or lesson for Twitter/X.
Rules: max 260 chars, actionable insight, no fluff, use 1 emoji, no hashtags.
Just the text only.`,

  meme: `Write a short trading meme/joke format for Twitter/X.
Rules: max 260 chars, format like a meme (setup/punchline), use relevant emojis, no hashtags.
Just the text only.`,

  market_context: `Write a brief morning market context tweet for a trading account.
Available data: DXY bias: {{dxyBias}}, Gold: {{goldLevel}} ({{goldBias}}), Indices: {{indexBias}}, Crypto: {{cryptoSentiment}}
Rules: max 260 chars, professional tone, use bullet or pipe separators, include 1-2 emojis.
Just the text only.`,

  waiting: `Write a brief "no trades today" tweet for a disciplined trading account.
Rules: max 240 chars, emphasizes discipline over FOMO, calm tone, 1 emoji.
Just the text only.`,

  eod_recap: `Write a brief end-of-day recap tweet.
Stats: {{signalsToday}} signals today, {{wins}}W/{{losses}}L this week, {{totalPips}} pips.
Rules: max 260 chars, clean format, professional, include #trading hashtag.
Just the text only.`,

  weekly_insight: `Write a brief weekly performance insight tweet.
Stats: {{wins}}W/{{losses}}L, {{winRate}}% WR, {{totalPips}} pips, best asset {{bestAsset}}, avg RR {{avgRR}}.
Rules: max 260 chars, data-driven, positive but honest tone, include #trading.
Just the text only.`,

  engagement_reply: `You are a trading account engaging with another trader's post on X.
Write a genuine, insightful reply that adds value. Max 200 chars. Sound like a real trader, not a bot.
Just the reply text only.`,
};

export const ANALYSIS_PROMPTS = {
  weekly_review: `You are reviewing a week of automated trading signals.
Stats: {{totalTrades}} trades, {{winRate}}% WR, {{avgRR}} avg RR, {{totalPips}} pips.
Best asset: {{bestAsset}}, Worst: {{worstAsset}}.
In 3 bullet points (max 25 words each), what should change next week? Be specific. No generic advice.`,

  signal_analysis: `Analyze this trading signal and give a brief confidence assessment:
Asset: {{asset}}, Direction: {{direction}}, Entry: {{entry}}, SL: {{stopLoss}}, TP1: {{tp1}}, TP2: {{tp2}}
Confluence: {{triggers}}, Session: {{session}}, Score: {{confluenceScore}}/5
Reply with: BULLISH/BEARISH/NEUTRAL + one sentence reason. Max 100 chars.`,
};
ENDOFFILE
