cat > src/templates.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — CONTENT TEMPLATES
// ════════════════════════════════════════════════════

export type ContentCategory =
  | 'question'
  | 'relatable'
  | 'educational'
  | 'meme'
  | 'market_context'
  | 'waiting'
  | 'eod_recap'
  | 'signal'
  | 'tp_hit'
  | 'sl_hit'
  | 'weekly_insight';

export interface TemplateVars {
  asset: string;
  direction: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rr: string;
  triggers: string;
  session: string;
  asset1?: string;
  asset2?: string;
  signalsToday?: number;
  wins?: number;
  losses?: number;
  totalPips?: number;
  winRate?: number;
  avgRR?: number;
  bestAsset?: string;
  worstAsset?: string;
  dxyBias?: string;
  goldLevel?: string;
  goldBias?: string;
  indexBias?: string;
  cryptoSentiment?: string;
}

// ════════════════════════════════════════════════════
// TEMPLATE POOLS
// ════════════════════════════════════════════════════
const questionTemplates = [
  "What's the one trading rule you wish you learned sooner?",
  "Risk reward or win rate — which matters more to you?",
  "One trade you took that changed your perspective entirely?",
  "Do you trade the news or wait for it to settle?",
  "Biggest lesson from your worst losing streak?",
  "Would you rather: 60% WR at 1:1 or 35% WR at 1:4?",
  "How long did it take you to find your edge?",
];

const relatableTemplates = [
  "Setting SL wider then price goes exactly to your old SL level 😤",
  "Moving your TP further and price reverses right before it hits 🤡",
  "'I'll just check the chart' — 2 hours later still scrolling",
  "That feeling when you follow your plan perfectly 🧘",
  "When your analysis is perfect but your entry timing is garbage",
  "Closing a trade manually then watching it hit TP without you",
  "The market waits for your stop loss then continues your way",
];

const educationalTemplates = [
  "Tip: A 1:3 RR with only 30% win rate is still profitable. Math doesn't care about feelings.",
  "The London Breakout works because Asian range defines equilibrium. When it breaks, liquidity shifts. Simple.",
  "Stop trying to catch every move. The best traders I know sit out 80% of the time.",
  "Your stop loss isn't a loss — it's business insurance. No insurance = no business.",
  "Confluence > single indicator. RSI alone = gambling. RSI + S&R + Trend = edge.",
  "Paper trading for 3 months sounds boring until you realize it saves you $3000 in tuition.",
  "The market doesn't owe you a retracement to your entry. Plan accordingly.",
];

const memeTemplates = [
  "Me: holds through drawdown\nAlso me: panic closes at break even\nPrice: rockets to TP 🚀🤡",
  "Trading plan at 8am: disciplined and patient\nTrading plan at 3pm: YEET 📉",
  "My trading journal vs my actual trades be like 📓 vs 🎢",
  "'The trend is your friend' — my only friend apparently 😂",
  "Day 1: I'll be a millionaire\nDay 100: I just want to be consistent\nDay 365: I just want my money back",
  "When you finally take a perfect setup and it still stops out — trust the process they said 🗿",
];

const marketContextTemplates = [
  "DXY {{dxyBias}} | Gold in {{goldLevel}} ({{goldBias}}) | Indices {{indexBias}} | Crypto {{cryptoSentiment}}",
  "Morning check: {{asset1}} and {{asset2}} in focus. Sessions aligning — watching for breakout setup.",
  "Market pulse: DXY {{dxyBias}}, Gold {{goldBias}}. Looking for clean entries in London session.",
  "Pre-session: {{asset1}} showing interesting levels. Patience > forcing a trade.",
  "Weekend analysis done. Key levels set. Now we wait for the market to come to us.",
];

const waitingTemplates = [
  "No setup today that meets our criteria. Discipline > FOMO. Not every day is a trading day. 👀",
  "Scanning {{asset1}}, {{asset2}} — nothing with enough confluence yet. Sitting on hands.",
  "Sometimes the best trade is no trade. Protecting capital for the right setup. 🛡️",
  "Market choppy across sessions. Waiting for clean structure before committing.",
];

const eodRecapTemplates = [
  "📊 EOD | Signals: {{signalsToday}} | 7D: {{wins}}W/{{losses}}L | Pips: {{totalPips}} | Another day of disciplined trading.",
  "Close of play. {{signalsToday}} signals scanned. Focus was on quality not quantity. Results follow process.",
  "EOD wrap. {{wins}}W/{{losses}}L this week. {{totalPips}} pips. Staying consistent. #trading",
];

const weeklyInsightTemplates = [
  "Weekly: {{wins}}W/{{losses}}L | WR: {{winRate}}% | Pips: {{totalPips}} | Best: {{bestAsset}} | RR: {{avgRR}} | Improving every week. 📈",
  "📊 Week done. {{totalTrades}} trades, {{winRate}}% WR. {{bestAsset}} was the star. Adjusting for next week based on data.",
  "Weekly review: {{wins}}W/{{losses}}L, {{totalPips}} pips, avg RR {{avgRR}}. The process works. Trust it. #trading",
];

// ════════════════════════════════════════════════════
// RECENTLY USED TRACKING (avoid repetition)
// ════════════════════════════════════════════════════
const recentlyUsed: Map<string, number[]> = new Map();
const RECENT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function cleanupRecent(category: string): void {
  const cutoff = Date.now() - RECENT_WINDOW;
  const used = recentlyUsed.get(category) || [];
  recentlyUsed.set(category, used.filter(t => t > cutoff));
}

function markUsed(category: string, index: number): void {
  const used = recentlyUsed.get(category) || [];
  used.push(Date.now());
  recentlyUsed.set(category, used);
}

function isUsed(category: string, index: number): boolean {
  const used = recentlyUsed.get(category) || [];
  return used.includes(index);
}

// ════════════════════════════════════════════════════
// GET UNIQUE TEMPLATE
// ════════════════════════════════════════════════════
const poolMap: Record<string, string[]> = {
  question: questionTemplates,
  relatable: relatableTemplates,
  educational: educationalTemplates,
  meme: memeTemplates,
  market_context: marketContextTemplates,
  waiting: waitingTemplates,
  eod_recap: eodRecapTemplates,
  weekly_insight: weeklyInsightTemplates,
  // Dynamic templates — generated by signalEngine, not from pools
  signal: [],
  tp_hit: [],
  sl_hit: [],
};

export function getUniqueTemplate(
  category: ContentCategory,
  vars: TemplateVars = {
    asset: 'EURUSD', direction: 'LONG', entry: 0,
    stopLoss: 0, tp1: 0, tp2: 0, rr: '0',
    triggers: '', session: '',
  }
): string | null {
  const pool = poolMap[category];

  if (!pool || pool.length === 0) {
    // Dynamic templates handled elsewhere (signalEngine)
    return null;
  }

  cleanupRecent(category);

  // Try to find unused template
  const unused = pool
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !isUsed(category, i));

  const pick = unused.length > 0
    ? unused[Math.floor(Math.random() * unused.length)]
    : { t: pool[Math.floor(Math.random() * pool.length)], i: -1 };

  markUsed(category, pick.i);

  // Replace {{var}} placeholders
  return pick.t.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = (vars as any)[key];
    if (val === undefined || val === null) return '';
    if (typeof val === 'number') return val === 0 ? '0' : val.toFixed(val < 10 ? 4 : val < 1000 ? 2 : 0);
    return String(val);
  });
}

export const weeklyInsightTemplates = weeklyInsightTemplates;
ENDOFFILE
