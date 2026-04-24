// ════════════════════════════════════════════════════
// APEX BOT v7.0 — TWEET TEMPLATES
// All 8 content categories with emoji variations
// ════════════════════════════════════════════════════

export interface TemplateVars {
  asset: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rr: string;
  triggers: string;
  session: string;
  grade?: string;
  retraceLevel?: string;
  liquidityTarget?: string;
  pnlPips?: number;
  lossPips?: number;
  signalsToday?: number;
  wins?: number;
  losses?: number;
  asset1?: string;
  asset2?: string;
  dxyBias?: string;
  goldLevel?: string;
  goldBias?: string;
  indexBias?: string;
  cryptoSentiment?: string;
  bestAsset?: string;
  worstAsset?: string;
  winRate?: number;
  totalPips?: number;
  avgRR?: number;
}

// ──────────────────────────────────────────────────────
// CATEGORY 1: SIGNAL POSTS (Triggered only)
// ──────────────────────────────────────────────────────
export const signalTemplates = [
  (v: TemplateVars): string => {
    const emoji = v.direction === 'LONG' ? '🟢' : '🔴';
    const arrow = v.direction === 'LONG' ? '📈' : '📉';
    const bias = v.direction === 'LONG' ? 'BULLISH' : 'BEARISH';
    return `${emoji} APEX SIGNAL — ${v.asset} | ${v.session} KZ

HTF Bias: ${bias} 😎
Entry: ${v.entry}${v.retraceLevel ? ` (${v.retraceLevel})` : ''} 📍
SL: ${v.stopLoss} | TP1: ${v.tp1} | TP2: ${v.tp2} 🚀
RR: 1:${v.rr}

Trigger: ${v.triggers} 🛡️
 ${v.liquidityTarget ? `Targeting: ${v.liquidityTarget} 🎯` : ''}

💡 Setup Grade: ${v.grade || 'A+'}
Pure Price Action + Market Structure

⚠️ Not financial advice. Manage risk wisely.`;
  },

  (v: TemplateVars): string => {
    const emoji = v.direction === 'LONG' ? '🟢' : '🔴';
    return `${emoji} ${v.asset} Setup is LIVE — APEX

 ${v.direction === 'LONG' ? 'Bullish' : 'Bearish'} bias confirmed on HTF 📊
Entry: ${v.entry} | SL: ${v.stopLoss}
TP1: ${v.tp1} ✅ | TP2: ${v.tp2} 🚀
R:R = 1:${v.rr}

Confluence: ${v.triggers}
 ${v.liquidityTarget ? `Target liquidity: ${v.liquidityTarget}` : ''}

A+ only. No B-grade trades here.
⚠️ Not financial advice.`;
  },

  (v: TemplateVars): string => {
    const emoji = v.direction === 'LONG' ? '📍' : '📍';
    return `${emoji} APEX SIGNAL — ${v.asset}

Session: ${v.session} | Bias: ${v.direction === 'LONG' ? 'Bullish' : 'Bearish'}
Entry Zone: ${v.entry} 🎯
Stop: ${v.stopLoss} | Targets: ${v.tp1} → ${v.tp2}
R:R = 1:${v.rr} 🔥

Structure: ${v.triggers}
 ${v.grade ? `Grade: ${v.grade} ✅` : ''}

Price action speaks. We listen.
⚠️ DYOR. Not financial advice.`;
  },
];

// ──────────────────────────────────────────────────────
// CATEGORY 2: WAITING POSTS (Scheduled filler)
// ──────────────────────────────────────────────────────
export const waitingTemplates = [
  (v: TemplateVars): string =>
    `🔴 No clean setup on majors right now 😌

Price drifting between key zones on ${v.asset1 || 'EURUSD'} and ${v.asset2 || 'GBPUSD'}.

We wait for structure to align properly.
Discipline first 🛡️ No chase.`,

  (v: TemplateVars): string =>
    `👀 Markets in no-man's-land today.

 ${v.asset1 || 'EURUSD'} chopping. ${v.asset2 || 'Gold'} waiting on a catalyst.

No A+ setup = no trade.
The sniper waits. 🎯`,

  (v: TemplateVars): string =>
    `😴 Nothing worth trading right now.

Patience is a strategy too.
Some of the best trades are the ones you don't take.

Watching ${v.asset1 || 'EURUSD'} for a potential setup later 👀
Will update when structure confirms. 🛡️`,

  (v: TemplateVars): string =>
    `🔴 Scanning ${v.asset1 || 'the majors'} and ${v.asset2 || 'Gold'}...

Structure isn't clean enough for an A+ entry yet.
We don't force trades. We wait for them to come to us 😌

This discipline is what separates consistent traders from gamblers 🧠`,

  (v: TemplateVars): string =>
    `⏳ No trigger on any major pair or index.

HTF structure is mixed — no clear directional bias yet.
Better to sit on hands than enter a 50/50 flip 🎲

 ${v.asset1 || 'Gold'} and ${v.asset2 || 'EURUSD'} both at interesting levels though 👀`,

  (v: TemplateVars): string =>
    `🔴 Waiting mode active.

Price is at key zones on ${v.asset1 || 'several pairs'} but no confirmation candle yet.

Entry without confirmation = gambling.
We need the break + retest. Not just the break. 🛡️

Patience pays the bills in this game 💰`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 3: MARKET CONTEXT (Daily macro summary)
// ──────────────────────────────────────────────────────
export const marketContextTemplates = [
  (v: TemplateVars): string =>
    `📊 APEX Market Context — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}

DXY: ${v.dxyBias || 'softening slightly'} 📉
Gold: ${v.goldLevel || '$2,300+ zone'} | Bias: ${v.goldBias || 'bullish'}
Indices: ${v.indexBias || 'mixed/choppy'} 📊
Crypto: BTC ${v.cryptoSentiment || 'holding key levels'} | Sentiment: ${v.cryptoSentiment || 'cautious'}

Key pairs to watch:
• ${v.asset1 || 'EURUSD'} — ${v.asset1 === 'EURUSD' ? 'DXY weakness supporting' : 'watching for breakout'}
• ${v.asset2 || 'XAUUSD'} — ${v.asset2 === 'XAUUSD' ? 'near key resistance' : 'consolidating at support'}

No signals yet. Monitoring structure closely. 🎯`,

  (v: TemplateVars): string =>
    `🌍 Morning Bias Check

 ${v.dxyBias ? `DXY ${v.dxyBias} — key driver for FX today` : 'Scanning for the dominant narrative this morning'}

Watching for London Breakout setups on:
→ ${v.asset1 || 'EURUSD'}
→ ${v.asset2 || 'GBPUSD'}
→ Gold if vol picks up 🥇

Sessions: London + NY overlap = prime hunting time 🎯
Stay patient. A+ setups only. 🛡️`,

  (v: TemplateVars): string =>
    `📊 Pre-London Scan

 ${v.asset1 || 'EURUSD'}: Near Asian range high — breakout candidate 🔥
 ${v.asset2 || 'Gold'}: Consolidating above support — watching for sweep first 👀
 ${v.cryptoSentiment ? `Crypto: ${v.cryptoSentiment}` : 'Crypto: BTC holding key level, ETH following'}

Will update if structure triggers an A+ entry during London session.

No anticipation — only reaction. 🛡️`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 4: OUT-OF-THE-BOX QUESTIONS
// ──────────────────────────────────────────────────────
export const questionTemplates = [
  `🤔 What if the real edge in trading isn't finding perfect entries… but training yourself to enjoy the quiet days between them? 😌

Would that change how you feel about flat markets?`,

  `🧠 Imagine you could only take trades that felt boring and obvious — never the exciting chase ones.

Would your account actually grow faster… or would you miss the thrill too much? 🔥`,

  `💭 Be honest — how many of your losing trades came from FOMO?

Now ask yourself: what would your P&L look like if you only took the ones you felt calm about? 🧊`,

  `🤔 Why do we spend 90% of our time looking for entries and 10% managing exits… when exits are what actually determine our P&L?

Think about that ratio today. 📊`,

  `💭 What's harder for you:
A) Sitting in a winning trade and not closing it early
B) Sitting out and watching a trade you missed run to target

Be honest with yourself 👇`,

  `🧠 If you could only trade ONE pattern for the rest of your life — no indicators, no news, just raw price action on one timeframe —

What would you pick and why? 👇`,

  `🤔 Question for experienced traders:

Do you actually follow your trading plan? Or do you "adapt" in the moment and call it discretion?

No judgment. Just truth. 👇`,

  `💭 The best traders I've studied all have one thing in common — they're bored most of the time.

Is boredom the real skill we should be practicing? 😌`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 5: NON-TRADING RELATABLE (GIF-friendly)
// ──────────────────────────────────────────────────────
export const relatableTemplates = [
  `😴 That morning battle with your alarm clock… "just 5 more minutes" somehow becomes 40 😅

While your brain is already planning the London session you'll probably adjust later anyway.

What's your longest successful negotiation record? 👇`,

  `😂 The discipline you show in trading… where is that energy when you're scrolling at 2am knowing you have a 7am wake up?

Asking for a friend obviously 🫠`,

  `📱 Phone says "screen time up 40%" and you know exactly where those extra hours went — checking if that position hit TP yet 😅

Who else has opened their phone 50 times for one trade? 👇`,

  `😴 "I'll just check the charts before bed"

2 hours later you've redrawn every level, changed your bias 3 times, and now you're watching a 15min chart on a pair you don't even trade 😂

We've all been there. Admit it. 👇`,

  `😂 The confidence you have placing a trade vs the confidence you have when someone asks "so what do you do for a living?"

Two completely different people 🫠`,

  `🤦 "I'll set my alarm for the London open"

Alarm goes off → "markets are boring, I'll check back at NY open" → misses the move → "I'll catch the next one"

Every. Single. Day. 😅`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 6: TRADING HUMOR / MEMES
// ──────────────────────────────────────────────────────
export const memeTemplates = [
  `🚀 "This candle looks perfect" — said right before liquidity sweep and reversal 😂

Feelings vs Rules: the eternal tug-of-war.`,

  `😂 Life throws distractions exactly when you're finally focused…

Yet you somehow remember every risk rule better than your weekend plans 😅

Who else has this selective memory brain?`,

  `🤡 Me: "I'll wait for the retest"
Also me: enters on the first touch
Also me: "why did it reverse"
Me again: "I'll wait for the retest next time"

Groundhog day but with money 😂`,

  `😂 Trading psychology speedrun:

9:00 "I'm patient today"
9:30 "That's probably a setup"
10:00 "Close enough to A+"
10:15 "Why is it going against me"
10:30 SL hit

Next week: "I'm patient today" 🔁`,

  `🧠 Your brain during a winning trade:

"This is easy, I should go full time" 💅
"This strategy is unbeatable" 😎
"I should increase position size" ⚠️
*market reverses*
"What happened I followed all the rules" 😭

The ego writes checks the account can't cash 😂`,

  `😂 "I trade price action only, no indicators"

Meanwhile the chart has:
✅ 3 EMAs
✅ Volume profile
✅ Session boxes
✅ Fibonacci levels
✅ S/R zones
✅ Order blocks
✅ Liquidity levels

"Clean chart though" 🤣`,

  `📉 When your SL is -20 pips but the spread is 2 pips on a "zero commission" broker

The fees are hidden but they're there 😂

Who else has been hit by this? 👇`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 7: EDUCATIONAL (Price action concepts)
// ──────────────────────────────────────────────────────
export const educationalTemplates = [
  `🧠 APEX Concept: Break of Structure (BOS)

In an uptrend: price makes higher highs + higher lows.
A BOS = when price breaks above the last major high.

This confirms:
✅ Buyers are in control
✅ Trend shifted bullish
✅ Look for long entries on pullback

Opposite for downtrend (lower lows + lower highs).

Simple. Repeatable. Effective. 🎯`,

  `🧠 Why we use Higher Timeframe (HTF) Bias:

Entering trades without HTF context = gambling.

Process:
• Weekly/Daily → overall direction
• 4H → structure + key zones
• 15min → actual entry trigger

Trading WITH the HTF structure = higher probability
Trading AGAINST it = fighting the river 🌊

Always zoom out first. 📊`,

  `🧠 Fair Value Gaps (FVG) — the institutional footprint:

When price moves fast (impulse candle), it often leaves a 3-candle gap where buyers and sellers couldn't agree on price.

Price tends to come back to "fill" these gaps before continuing.

How to trade them:
1. Identify FVG on 15min or 1H
2. Wait for price to return to the zone
3. Confirm with structure alignment
4. Enter with tight SL

Not magic. Just market mechanics. 📊🛡️`,

  `🧠 Order Blocks — where institutions left their footprints:

An order block is the LAST opposite candle before a strong impulse move.

Bullish OB = last bearish candle before a strong bullish push
Bearish OB = last bullish candle before a strong bearish push

Why it works: That's where big money got their fills. Price returns there to offer more liquidity.

Key rule: Only trade OBs that align with HTF structure. Not every OB is a trade. 📊`,

  `🧠 Liquidity Sweeps — the trap most retail traders fall into:

Price pushes just past a key high/low (stops everyone out)
Then reverses hard in the opposite direction.

Why? Because stop losses = liquidity. Institutions need that liquidity to fill their large orders.

How to trade it:
1. Mark obvious swing highs/lows
2. Wait for price to sweep past them
3. Watch for reversal candle
4. Enter in the opposite direction

The market hunts stops. Don't be the stop. 🛡️`,

  `🧠 Risk/Reward — the only math that matters:

Most traders focus on win rate.
Pros focus on R:R.

Example:
Strategy A: 60% win rate, 1:1 RR → loses money over time
Strategy B: 45% win rate, 1:3 RR → prints money consistently

Why? Because losses are capped at 1R but winners average 3R.
You can be wrong MORE than half the time and still profit.

This is the math edge. Learn it. 📊`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 8: EOD RECAP
// ──────────────────────────────────────────────────────
export const eodRecapTemplates = [
  (v: TemplateVars): string =>
    `📆 EOD: ${v.signalsToday === 0 ? 'Patient session.' : `${v.signalsToday} signal(s) posted today.`}

 ${v.signalsToday === 0
  ? 'Structure didn\'t line up for an A+ setup — capital protected 😌'
  : `Results: ${v.wins || 0}W / ${v.losses || 0}L`
}

 ${v.signalsToday === 0
  ? 'Ready for whatever tomorrow brings.'
  : `RR captured: +${v.totalPips || 0}R`
}

How was your day? 👇`,

  (v: TemplateVars): string =>
    `🌙 End of Day

 ${v.signalsToday === 0
  ? 'No forced entries today. Discipline held. 😌'
  : `${v.signalsToday} signal(s) posted.\nOutcome: ${v.wins || 0}W / ${v.losses || 0}L`
}

 ${v.totalPips && v.totalPips > 0 ? `Pips: +${v.totalPips} 💰` : v.totalPips && v.totalPips < 0 ? `Pips: ${v.totalPips} (managed)` : ''}

Markets never sleep but traders need to 😴
Back tomorrow. Fresh eyes. New structure. 🎯`,

  (v: TemplateVars): string =>
    `📊 Daily Wrap

Signals: ${v.signalsToday || 0} posted
 ${v.wins || v.losses ? `Record: ${v.wins || 0}W / ${v.losses || 0}L` : 'No trades triggered today'}

 ${v.asset1 || 'EURUSD'}: Watching for ${v.direction === 'LONG' ? 'bullish' : 'bearish'} continuation tomorrow
 ${v.asset2 || 'Gold'}: At interesting level, needs confirmation

Patience level: ${v.signalsToday === 0 ? '🔥 Maximum' : '😤 Tested but holding'} 🛡️`,
];

// ──────────────────────────────────────────────────────
// CATEGORY 9: WEEKLY INSIGHT (From meta-learning)
// ──────────────────────────────────────────────────────
export const weeklyInsightTemplates = [
  (v: TemplateVars): string =>
    `📊 APEX Weekly Intelligence

Based on last 30 days of data:

🏆 Best performing asset: ${v.bestAsset || 'EURUSD'} (${v.winRate ? (v.winRate).toFixed(0) : 'N/A'}% WR)
📈 Total signals: ${v.signalsToday || 'N/A'}
💰 Pips captured: ${v.totalPips && v.totalPips > 0 ? `+${v.totalPips}` : 'N/A'}
⚡ Avg RR: ${v.avgRR ? v.avgRR.toFixed(1) : 'N/A'}:1

Data-driven. Transparent. Always improving. 🧠`,

  (v: TemplateVars): string =>
    `🧠 Weekly Review — What the numbers say:

Win Rate: ${v.winRate ? (v.winRate).toFixed(0) : 'N/A'}%
 ${v.bestAsset ? `Top pair: ${v.bestAsset}` : ''}
 ${v.worstAsset ? `Weakest pair: ${v.worstAsset}` : ''}
 ${v.avgRR ? `Average R:R achieved: ${v.avgRR.toFixed(1)}:1` : ''}

 ${v.totalPips && v.totalPips > 0
  ? `Net pips: +${v.totalPips} — profitable week ✅`
  : v.totalPips && v.totalPips < 0
  ? `Net pips: ${v.totalPips} — learning week, adjustments made`
  : 'First week — building baseline data'
}

No ego. Just numbers. 📊`,
];

// ──────────────────────────────────────────────────────
// RESULT POSTS (TP hit / SL hit)
// ──────────────────────────────────────────────────────
export const tpHitTemplates = [
  (v: TemplateVars): string =>
    `✅ TP${v.tp1 ? '1' : '2'} HIT — ${v.asset}

Direction: ${v.direction}
Entry: ${v.entry}
TP: ${v.tp1 || v.tp2} ✅

+${v.pnlPips} pips 💰
 ${v.tp2 ? `Running to TP2: ${v.tp2} 🎯` : 'Full target reached 🏆'}

#${v.asset.replace('/', '')} #forex #trading`,

  (v: TemplateVars): string =>
    `🏆 ${v.asset} — TARGET REACHED

TP${v.tp1 ? '1' : '2'} ✅ locked in.
From ${v.entry} to ${v.tp1 || v.tp2} 🚀
RR Achieved: 1:${v.rr}

This is why we wait for A+ setups only.
No noise. Just structure. 🛡️`,
];

export const slHitTemplates = [
  (v: TemplateVars): string =>
    `⚠️ SL Hit — ${v.asset}

Direction: ${v.direction}
Entry: ${v.entry}
SL: ${v.stopLoss}

Risk managed. Moving to next setup 📊
Every loss is a lesson 💪

#${v.asset.replace('/', '')} #forex #trading #riskmanagement`,

  (v: TemplateVars): string =>
    `📉 ${v.asset} — SL Hit

-1R. Happens. Part of the process.
Setup was valid. Market had other plans.

Win rate stays honest here. No hiding losses.
We move forward. 👊`,
];

// ──────────────────────────────────────────────────────
// TEMPLATE SELECTOR HELPER
// ──────────────────────────────────────────────────────
export type ContentCategory =
  | 'signal'
  | 'waiting'
  | 'market_context'
  | 'question'
  | 'relatable'
  | 'meme'
  | 'educational'
  | 'eod_recap'
  | 'weekly_insight'
  | 'tp_hit'
  | 'sl_hit';

export function getRandomTemplate(
  category: ContentCategory,
  vars: TemplateVars = {} as TemplateVars
): string {
  const templateMap: Record<string, Array<(v: TemplateVars) => string>> = {
    signal: signalTemplates,
    waiting: waitingTemplates,
    market_context: marketContextTemplates,
    question: questionTemplates.map(t => () => t),
    relatable: relatableTemplates.map(t => () => t),
    meme: memeTemplates.map(t => () => t),
    educational: educationalTemplates.map(t => () => t),
    eod_recap: eodRecapTemplates,
    weekly_insight: weeklyInsightTemplates,
    tp_hit: tpHitTemplates,
    sl_hit: slHitTemplates,
  };

  const pool = templateMap[category];
  if (!pool || pool.length === 0) {
    return `APEX Bot — ${category} post`;
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index](vars);
}

// Track which templates were used recently to avoid repeats
const recentUsage: ContentCategory[] = [];

export function getUniqueTemplate(
  category: ContentCategory,
  vars: TemplateVars = {} as TemplateVars,
  poolSize: number = 3
): string {
  // If same category was used recently, try a different index
  const recentSameCategory = recentUsage.filter(c => c === category).length;
  const pool = category === 'signal' ? signalTemplates
    : category === 'waiting' ? waitingTemplates
    : category === 'market_context' ? marketContextTemplates
    : category === 'eod_recap' ? eodRecapTemplates
    : category === 'weekly_insight' ? weeklyInsightTemplates
    : category === 'tp_hit' ? tpHitTemplates
    : category === 'sl_hit' ? slHitTemplates
    : null;

  if (pool && pool.length > 1) {
    const skipCount = Math.min(recentSameCategory, pool.length - 1);
    const index = skipCount % pool.length;
    recentUsage.push(category);
    if (recentUsage.length > 20) recentUsage.shift();
    return pool[index](vars);
  }

  const result = getRandomTemplate(category, vars);
  recentUsage.push(category);
  if (recentUsage.length > 20) recentUsage.shift();
  return result;
}
