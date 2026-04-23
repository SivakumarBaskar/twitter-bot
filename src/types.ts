// ════════════════════════════════════════════════════
// APEX BOT — ALL TYPE DEFINITIONS
// ════════════════════════════════════════════════════

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceData {
  symbol: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  candles: {
    '15m': OHLCV[];
    '1h':  OHLCV[];
    '4h':  OHLCV[];
    '1d':  OHLCV[];
  };
  source: 'TWELVE_DATA' | 'BINANCE' | 'YAHOO';
  fetchedAt: number;
}

export interface Indicators {
  rsi: {
    value: number;
    signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  };
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    crossover: 'BULLISH' | 'BEARISH' | 'NONE';
  };
  ema: {
    ema20: number;
    ema50: number;
    ema200: number;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  atr: number;
  volume: {
    current: number;
    average: number;
    spike: boolean;
    ratio: number;
  };
  supportResistance: {
    nearSupport: boolean;
    nearResistance: boolean;
    supportLevel: number;
    resistanceLevel: number;
  };
}

export type SignalDirection = 'LONG' | 'SHORT';
export type SignalStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'SL_HIT'
  | 'CLOSED'
  | 'EXPIRED';

export interface TradingSignal {
  id: string;
  symbol: string;
  displayName: string;
  direction: SignalDirection;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rrRatio: number;
  confluenceScore: number;
  confluenceDetails: {
    trendAlignment: boolean;
    momentumSignal: boolean;
    volumeConfirm: boolean;
    srLevel: boolean;
    sessionFilter: boolean;
  };
  session: string;
  status: SignalStatus;
  indicators: Indicators;
  createdAt: number;
  updatedAt: number;
  postedToX: boolean;
  xPostId?: string;
  tp1HitAt?: number;
  tp2HitAt?: number;
  slHitAt?: number;
  pnlPips?: number;
}

export type ReplyType =
  | 'USDT_ADDRESS'
  | 'METAWIN_ID'
  | 'CRYPTO_ADDRESS';

export interface GiveawayPost {
  id: string;
  accountHandle: string;
  postId: string;
  postUrl: string;
  postText: string;
  detectedAt: number;
  isGiveaway: boolean;
  replyType: ReplyType;
  replied: boolean;
  repliedAt?: number;
  liked: boolean;
  retweeted: boolean;
  quoted: boolean;
  aiComment: string;
  currency?: 'BTC' | 'SOL' | 'ETH' | 'USDT' | 'UNKNOWN';
}

export interface TradeRecord {
  id: string;
  signalId: string;
  symbol: string;
  direction: SignalDirection;
  entry: number;
  exit: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  status: SignalStatus;
  pnlPips: number;
  pnlPercent: number;
  confluenceScore: number;
  session: string;
  rsiAtEntry: number;
  macdAtEntry: string;
  trendAtEntry: string;
  atrAtEntry: number;
  createdAt: number;
  closedAt: number;
}

export interface PerformanceMetrics {
  period: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRR: number;
  totalPips: number;
  maxDrawdown: number;
  byAsset: Record<string, AssetPerformance>;
  bySession: Record<string, SessionPerformance>;
  byConfluence: Record<number, number>;
}

export interface AssetPerformance {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number;
  avgPips: number;
  bestSession: string;
}

export interface SessionPerformance {
  session: string;
  trades: number;
  wins: number;
  winRate: number;
  avgPips: number;
}

export interface AdaptiveParams {
  symbol: string;
  rsiOverbought: number;
  rsiOversold: number;
  minConfluenceScore: number;
  preferredSessions: string[];
  tp1Multiplier: number;
  tp2Multiplier: number;
  slMultiplier: number;
  riskPercent: number;
  lastUpdated: number;
  updateReason: string;
}

export interface TelegramMessage {
  type:
    | 'SIGNAL'
    | 'TP_HIT'
    | 'SL_HIT'
    | 'GIVEAWAY'
    | 'ERROR'
    | 'INFO'
    | 'WEEKLY_REPORT'
    | 'DAILY_SUMMARY';
  title: string;
  body: string;
  timestamp: number;
}

export interface AssetConfig {
  symbol: string;
  type: 'FX' | 'CRYPTO' | 'INDEX' | 'COMMODITY';
  yahooSymbol: string;
  binanceSymbol: string | null;
  displayName: string;
}

export interface GiveawayAccount {
  handle: string;
  replyType: ReplyType;
  actions: string[];
  keywords: string[];
  replyTemplate: string;
}

export interface PriceSourceResult {
  success: boolean;
  data?: PriceData;
  error?: string;
  source: 'TWELVE_DATA' | 'BINANCE' | 'YAHOO';
}

export interface BotState {
  isRunning: boolean;
  startedAt: number;
  lastSignalAt: number;
  signalsToday: number;
  actionsToday: number;
  activeSignals: TradingSignal[];
  errors: string[];
}
