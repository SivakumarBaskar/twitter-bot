import dotenv from 'dotenv';
dotenv.config();

export const config = {

  // ── IDENTITY ──────────────────────────────────────
  bot: {
    name: 'APEX Trading Bot',
    version: '1.0.0',
    username: process.env.X_USERNAME || 'SivakumarBMS',
    environment: process.env.NODE_ENV || 'production',
  },

  // ── X CREDENTIALS ─────────────────────────────────
  x: {
    username: process.env.X_USERNAME!,
    email: process.env.X_EMAIL!,
    password: process.env.X_PASSWORD!,
    baseUrl: 'https://twitter.com',
    maxActionsPerDay: parseInt(process.env.MAX_DAILY_ACTIONS || '20'),
    maxActionsPerRun: parseInt(process.env.MAX_ACTIONS_PER_RUN || '5'),
  },

  // ── TELEGRAM ──────────────────────────────────────
  telegram: {
    token: process.env.TELEGRAM_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  },

  // ── AI ────────────────────────────────────────────
  gemini: {
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-1.5-flash',
    maxTokens: 500,
  },

  // ── PRICE DATA APIs ───────────────────────────────
  priceData: {
    twelveData: {
      key: process.env.TWELVE_DATA_KEY!,
      baseUrl: 'https://api.twelvedata.com',
      rateLimit: 800,
    },
    binance: {
      baseUrl: 'https://api.binance.com',
    },
    yahoo: {
      enabled: true,
    },
  },

  // ── WALLETS ───────────────────────────────────────
  wallets: {
    usdt_erc20: process.env.WALLET_USDT_ERC20!,
    btc: process.env.WALLET_BTC!,
    sol: process.env.WALLET_SOL!,
    metawinId: process.env.METAWIN_ID!,
  },

  // ── GIVEAWAY ACCOUNTS ─────────────────────────────
  giveawayAccounts: [
    {
      handle: 'eliasraw7',
      replyType: 'USDT_ADDRESS',
      actions: ['like', 'retweet', 'reply'],
      keywords: [
        'giveaway', 'giving away', 'win', 'winner',
        'drop', 'free', 'airdrop', 'prize', 'contest'
      ],
      replyTemplate: 'usdt',
    },
    {
      handle: 'metawin',
      replyType: 'METAWIN_ID',
      actions: ['like', 'retweet', 'reply', 'quote'],
      keywords: [
        'giveaway', 'win', 'winner', 'free',
        'prize', 'competition', 'enter', 'metawin'
      ],
      replyTemplate: 'metawin',
    },
    {
      handle: 'moonpay',
      replyType: 'CRYPTO_ADDRESS',
      actions: ['like', 'retweet', 'reply'],
      keywords: [
        'giveaway', 'win', 'free', 'crypto',
        'bitcoin', 'btc', 'solana', 'sol', 'prize'
      ],
      replyTemplate: 'moonpay',
    },
    {
      handle: 'skelhorn',
      replyType: 'METAWIN_ID',
      actions: ['like', 'retweet', 'reply'],
      keywords: [
        'giveaway', 'win', 'free', 'prize',
        'competition', 'enter', 'contest'
      ],
      replyTemplate: 'metawin',
    },
  ],

  // ── TRADING ASSETS ────────────────────────────────
  assets: [
    { symbol: 'EURUSD', type: 'FX',        yahooSymbol: 'EURUSD=X', binanceSymbol: null,      displayName: 'EUR/USD' },
    { symbol: 'GBPUSD', type: 'FX',        yahooSymbol: 'GBPUSD=X', binanceSymbol: null,      displayName: 'GBP/USD' },
    { symbol: 'USDJPY', type: 'FX',        yahooSymbol: 'USDJPY=X', binanceSymbol: null,      displayName: 'USD/JPY' },
    { symbol: 'AUDUSD', type: 'FX',        yahooSymbol: 'AUDUSD=X', binanceSymbol: null,      displayName: 'AUD/USD' },
    { symbol: 'USDCAD', type: 'FX',        yahooSymbol: 'USDCAD=X', binanceSymbol: null,      displayName: 'USD/CAD' },
    { symbol: 'USDCHF', type: 'FX',        yahooSymbol: 'USDCHF=X', binanceSymbol: null,      displayName: 'USD/CHF' },
    { symbol: 'BTCUSD', type: 'CRYPTO',    yahooSymbol: 'BTC-USD',  binanceSymbol: 'BTCUSDT', displayName: 'BTC/USD' },
    { symbol: 'ETHUSD', type: 'CRYPTO',    yahooSymbol: 'ETH-USD',  binanceSymbol: 'ETHUSDT', displayName: 'ETH/USD' },
    { symbol: 'SOLUSD', type: 'CRYPTO',    yahooSymbol: 'SOL-USD',  binanceSymbol: 'SOLUSDT', displayName: 'SOL/USD' },
    { symbol: 'SPX500', type: 'INDEX',     yahooSymbol: '^GSPC',    binanceSymbol: null,      displayName: 'S&P 500' },
    { symbol: 'NAS100', type: 'INDEX',     yahooSymbol: '^NDX',     binanceSymbol: null,      displayName: 'NASDAQ 100' },
    { symbol: 'XAUUSD', type: 'COMMODITY', yahooSymbol: 'GC=F',     binanceSymbol: null,      displayName: 'Gold/USD' },
    { symbol: 'XAGUSD', type: 'COMMODITY', yahooSymbol: 'SI=F',     binanceSymbol: null,      displayName: 'Silver/USD' },
  ],

  // ── TRADING SESSIONS ──────────────────────────────
  sessions: {
    asian: {
      name: 'Asian Session',
      startUTC: 0,
      endUTC: 9,
      assets: ['USDJPY', 'AUDUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD'],
    },
    london: {
      name: 'London Session',
      startUTC: 8,
      endUTC: 17,
      assets: ['EURUSD', 'GBPUSD', 'USDCHF', 'XAUUSD', 'XAGUSD'],
    },
    newYork: {
      name: 'New York Session',
      startUTC: 13,
      endUTC: 22,
      assets: ['EURUSD', 'GBPUSD', 'USDCAD', 'SPX500', 'NAS100', 'XAUUSD'],
    },
  },

  // ── APEX STRATEGY PARAMETERS ──────────────────────
  strategy: {
    minConfluenceScore: parseInt(process.env.MIN_CONFLUENCE_SCORE || '3'),
    maxSignalsPerDay: parseInt(process.env.MAX_SIGNALS_PER_DAY || '8'),
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE || '1.5'),
    maxDrawdownPercent: parseFloat(process.env.MAX_DRAWDOWN_PERCENT || '10'),
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },
    macd: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    },
    ema: {
      fast: 20,
      slow: 50,
      trend: 200,
    },
    atr: {
      period: 14,
      slMultiplier: 1.5,
      tp1Multiplier: 2.0,
      tp2Multiplier: 3.5,
    },
    confluence: {
      trendAlignment: 1,
      momentumSignal: 1,
      volumeConfirm: 1,
      srLevel: 1,
      sessionFilter: 1,
    },
  },

  // ── PUPPETEER SETTINGS ────────────────────────────
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    actionDelayMin: parseInt(process.env.ACTION_DELAY_MIN || '3000'),
    actionDelayMax: parseInt(process.env.ACTION_DELAY_MAX || '8000'),
    typingDelayMin: 80,
    typingDelayMax: 180,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },

  // ── DATABASE ──────────────────────────────────────
  database: {
    path: process.env.DB_PATH || './data/apex.db',
  },

  // ── LOGGING ───────────────────────────────────────
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    path: process.env.LOG_PATH || './logs/apex.log',
  },

} as const;

export type Config = typeof config;
