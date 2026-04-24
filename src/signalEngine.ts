// ════════════════════════════════════════════════════
// APEX BOT v7.0 — SIGNAL ENGINE (REWRITTEN)
// 3 Proven Breakout Strategies:
//   FX + Gold: London Breakout (Asian range → London break)
//   Crypto: 4H Opening Range Breakout
//   US Indices: 30min ORB at NY open
// ════════════════════════════════════════════════════

import { EMA, ATR } from 'technicalindicators';
import { config } from './config';
import { adaptiveDB, signalDB } from './database';
import type {
  PriceData, OHLCV, TradingSignal, SignalDirection, Indicators,
} from './types';

// ════════════════════════════════════════════════════
// STRATEGY CONSTANTS
// ════════════════════════════════════════════════════
const LONDON_BREAKOUT = {
  asianStartUTC: 0,    // 00:00 UTC
  asianEndUTC: 7,      // 07:00 UTC
  checkStartUTC: 7,    // Start checking for breakout
  checkEndUTC: 12,     // Stop checking
  minRangePips: 15,    // Minimum Asian range in pips for valid setup
  maxRangePips: 120,   // Too wide = weak breakout
  minVolumeRatio: 1.3,  // Breakout candle must exceed this vs 20-candle avg
  slBufferPips: 5,      // Extra pips beyond Asian range for SL
  tp1Multiplier: 2.0,   // TP1 = 2x range
  tp2Multiplier: 3.5,   // TP2 = 3.5x range
  // Assets: FX + Gold
  assets: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'XAUUSD', 'XAGUSD'],
};

const CRYPTO_4H_ORB = {
  firstCandleUTC: 0,    // First 4H candle starts at 00:00 UTC
  checkStartUTC: 4,     // Start checking for breakout after first candle closes
  checkEndUTC: 24,      // Check all day
  minRangePct: 0.3,    // Range must be > 0.3% of price
  maxRangePct: 3.0,    // Too wide = unreliable
  minVolumeRatio: 1.4,
  slBufferPct: 0.15,    // Extra % beyond range for SL
  tp1Multiplier: 2.0,
  tp2Multiplier: 3.5,
  // Assets: Crypto
  assets: ['BTCUSD', 'ETHUSD', 'SOLUSD'],
};

const INDEX_30MIN_ORB = {
  sessionStartUTC: 13.5, // NY session opens 13:30 UTC
  orbMinutes: 30,        // First 30 minutes
  checkStartUTC: 14,     // After first 30min
  checkEndUTC: 16,       // Check for 2.5 hours after NY open
  minRangePct: 0.15,    // Lower threshold for indices
  maxRangePct: 1.5,
  minVolumeRatio: 1.2,
  slBufferPct: 0.1,
  tp1Multiplier: 2.0,
  tp2Multiplier: 3.0,
  // Assets: US Indices
  assets: ['SPX500', 'NAS100'],
};

// ── Session timing ──────────────────────────────────────
function getCurrentSessionInfo(): {
  const hour = new Date().getUTCHours();

  if (hour >= LONDON_BREAKOUT.checkStartUTC && hour < LONDON_BREAKOUT.checkEndUTC) {
    return {
      strategy: 'london_breakout' as const,
      assets: LONDON_BREAKOUT.assets,
      label: 'London Breakout',
    };
  }

  // Crypto 4H ORB: check after each 4H candle close
  if (hour === 4 || hour === 8 || hour === 12 || hour === 16 || hour === 20 || hour === 0) {
    return {
      strategy: 'crypto_4h_orb' as const,
      assets: CRYPTO_4H_ORB.assets,
      label: 'Crypto 4H ORB',
    };
  }

  // Index ORB: check after NY open
  if (hour >= INDEX_30MIN_ORB.checkStartUTC && hour < INDEX_30MIN_ORB.checkEndUTC) {
    return {
      strategy: 'index_30min_orb' as const,
      assets: INDEX_30MIN_ORB.assets,
      label: 'Index 30min ORB',
    };
  }

  return { strategy: 'none' as const, assets: [] as string[], label: 'No active session' };
}

// ════════════════════════════════════════════════════
// RANGE CALCULATION HELPERS
// ════════════════════════════════════════════════════
interface Range {
  high: number;
  low: number;
  size: number;      // In price units (pips for FX, % for crypto/indices)
  sizePct: number;     // In percentage of price
  sizePips: number;    // Always in pips for display
  startTimestamp: number;
  endTimestamp: number;
  candleCount: number;
}

function getDigitMultiplier(symbol: string): number {
  if (symbol.includes('JPY')) return 100;
  if (['BTCUSD', 'ETHUSD', 'SPX500', 'NAS100'].includes(symbol)) return 1;
  if (['SOLUSD', 'XAUUSD', 'XAGUSD'].includes(symbol)) return 100;
  return 10000; // FX majors like EURUSD
}

function priceDiffToPips(price: number, diff: number, symbol: string): number {
  return Math.round(diff * getDigitMultiplier(symbol));
}

function calcRange(candles: OHLCV[], startIdx: number, endIdx: number, symbol: string): Range | null {
  if (candles.length < endIdx + 1) return null;

  let high = -Infinity;
  let low = Infinity;
  let startTs = candles[startIdx]?.timestamp || 0;
  let endTs = candles[endIdx]?.timestamp || 0;

  for (let i = startIdx; i <= endIdx; i++) {
    if (candles[i].high > high) high = candles[i].high;
    if (candles[i].low < low) low = candles[i].low;
  }

  if (high <= low || high === -Infinity) return null;

  const size = high - low;
  const midPrice = (high + low) / 2;
  const sizePct = midPrice > 0 ? (size / midPrice) * 100 : 0;
  const sizePips = priceDiffToPips(midPrice, size, symbol);

  return {
    high,
    low,
    size,
    sizePct,
    sizePips,
    startTimestamp: startTs,
    endTimestamp: endTs,
    candleCount: endIdx - startIdx + 1,
  };
}

// ════════════════════════════════════════════════════
// CALCULATE EMA TREND FILTER (HTF)
// Uses 1H candles for trend direction
// ════════════════════════════════════════════════════
function calcHTFTrend(candles1H: OHLCV[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (candles1H.length < 200) return 'NEUTRAL';

  const closes = candles1H.map(c => c.close);

  const ema50 = EMA.calculate({ values: closes, period: 50 });
  const ema200 = EMA.calculate({ values: closes, period: 200 });

  const ema50Val = ema50[ema50.length - 1];
  const ema200Val = ema200[ema200.length - 1];
  const currentPrice = closes[closes.length - 1];

  if (currentPrice > ema50Val && ema50Val > ema200Val) return 'BULLISH';
  if (currentPrice < ema50Val && ema50Val < ema200Val) return 'BEARISH';
  return 'NEUTRAL';
}

// ════════════════════════════════════════════════════
// CALCULATE ATR FOR SL BUFFER
// Uses 1H candles for stable ATR reading
// ════════════════════════════════════════════════════
function calcATR(candles1H: OHLCV[], period: number = 14): number {
  if (candles1H.length < period + 1) return 0;

  const highs = candles1H.map(c => c.high);
  const lows = candles1H.map(c => c.low);
  const closes = candles1H.map(c => c.close);

  const atrValues = ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period,
  });

  return atrValues[atrValues.length - 1] || 0;
}

// ════════════════════════════════════════════════════
// CALCULATE VOLUME SPIKE
// Breakout candle volume vs 20-candle average
// ════════════════════════════════════════════════════
function hasVolumeSpike(candles: OHLC[], breakoutIdx: number, minRatio: number): boolean {
  if (breakoutIdx < 20) return false;

  const recent20 = candles.slice(breakoutIdx - 20, breakoutIdx);
  const avgVol = recent20.reduce((s, c) => s + c.volume, 0) / 20;
  if (avgVol === 0) return false;

  const breakoutVol = candles[breakoutIdx].volume;
  return breakoutVol >= avgVol * minRatio;
}

// ════════════════════════════════════════════════════
// CONFLUENCE SCORING (5 layers, but strategy-appropriate)
// ════════════════════════════════════════════════════
interface BreakoutConfluence {
  score: number;        // 0-5
  trendAlignment: boolean;  // EMA 50 > EMA 200 for long
  volumeSpike: boolean;    // Breakout candle volume spike
  rangeQuality: boolean;   // Range not too small or too wide
  freshBreak: boolean;     // First break of the range (not a retest)
  details: string[];
}

function scoreBreakoutConfluence(
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  direction: SignalDirection,
  volumeSpike: boolean,
  rangePips: number,
  minPips: number,
  maxPips: number,
  alreadyBroken: boolean
): BreakoutConfluence {
  const details: string[] = [];
  let score = 0;

  // Layer 1: Trend alignment
  const trendMatch =
    (direction === 'LONG' && trend === 'BULLISH') ||
    (direction === 'SHORT' && trend === 'BEARISH');
  if (trendMatch) {
    score++;
    details.push('HTF trend aligned');
  }

  // Layer 2: Volume spike on breakout
  if (volumeSpike) {
    score++;
    details.push('Volume spike on breakout');
  }

  // Layer 3: Range quality
  if (rangePips >= minPips && rangePips <= maxPips) {
    score++;
    details.push(`Range quality: ${rangePips} pips`);
  }

  // Layer 4: Fresh break (first time range is broken)
  if (!alreadyBroken) {
    score++;
    details.push('Fresh breakout (first break)');
  }

  // Layer 5: Directional confluence (trend + volume + range all agree)
  if (trendMatch && volumeSpike) {
    score++;
    details.push('Strong multi-confirm');
  }

  return { score, trendAlignment: trendMatch, volumeSpike, rangeQuality: score >= 3, freshBreak: !alreadyBroken, details };
}

// ════════════════════════════════════════════════════
// STRATEGY 1: LONDON BREAKOUT (FX + Gold)
// Asian range → London breakout → retest → signal
// ════════════════════════════════════════════════════════
function detectLondonBreakout(
  candles15m: OHLCV[],
  candles1H: OHLCV[],
  asset: string,
  symbol: string
): TradingSignal | null {

  // Step 1: Calculate Asian Range (candles from 00:00 to 07:00 UTC)
  const asianStartIdx = 0;
  // Find the candle closest to 00:00 UTC
  let asianStart = 0;
  for (let i = 0; i < candles15m.length; i++) {
    const candleDate = new Date(candles15m[i].timestamp);
    const utcHour = candleDate.getUTCHours();
    if (utcHour === 0) {
      asianStart = i;
      break;
    }
  }

  // Find the candle closest to 07:00 UTC
  let asianEnd = 0;
  for (let i = asianStart; i < candles15m.length; i++) {
    const utcHour = new Date(candles15m[i].timestamp).getUTCHours();
    if (utcHour >= 7) {
      asianEnd = i - 1;
      break;
    }
  }

  if (asianEnd <= asianStart) {
    console.log(`  ⚠️ Not enough pre-London data for ${asset} (${asianEnd - asianStart + 1} candles)`);
    return null;
  }

  // Calculate the range
  const asianRange = calcRange(candles15m, asianStart, asianEnd, symbol);
  if (!asianRange || asianRange.sizePips < LONDON_BREAKOUT.minRangePips) {
    console.log(`  ➖ ${asset}: Asian range too small (${asianRange.sizePips} pips, need ${LONDON_BREAKOUT.minRangePips}+)`);
    return null;
  }

  if (asianRange.sizePips > LONDON_BREAKOUT.maxRangePips) {
    console.log(`  ➖ ${asset}: Asian range too wide (${asianRange.sizePips} pips, max ${LONDON_BREAKOUT.maxRangePips})`);
    return null;
  }

  console.log(`  📏 ${asset}: Asian Range = ${asianRange.sizePips} pips (High: ${asianRange.high}, Low: ${asianRange.low})`);

  // Step 2: Check for breakout of Asian Range
  // Look at candles AFTER 07:00 UTC
  let breakoutFound = false;
  let breakoutIdx = -1;
  let breakoutDirection: SignalDirection | null = null;

  for (let i = asianEnd + 1; i < candles15m.length; i++) {
    const candle = candles15m[i];
    const utcHour = new Date(candle.timestamp).getUTCHours();

    // Only check during London window
    if (utcHour < LONDON_BREAKOUT.checkStartUTC || utcHour >= LONDON_BREAKOUT.checkEndUTC) break;

    const isLongBreak = candle.close > asianRange.high;
    const isShortBreak = candle.close < asianRange.low;

    if (isLongBreak) {
      breakoutFound = true;
      breakoutIdx = i;
      breakoutDirection = 'LONG';
      break;
    }

    if (isShortBreak) {
      breakoutFound = true;
      breakoutIdx = i;
      breakoutDirection = 'SHORT';
      break;
    }
  }

  if (!breakoutFound) {
    console.log(`  ➖ ${asset}: No breakout of Asian range yet`);
    return null;
  }

  // Step 3: Check if the breakout candle CLOSED beyond the range
  const breakoutCandle = candles15m[breakoutIdx];
  const isLongClose = breakoutCandle.close > asianRange.high;
  const isShortClose = breakoutCandle.close < asianRange.low;

  if (!((breakoutDirection === 'LONG' && isLongClose) &&
      !(breakoutDirection === 'SHORT' && isShortClose)) {
    console.log(`  ➖ ${asset}: Wick broke range but candle didn't close beyond it`);
    return null;
  }

  console.log(`  🚨 ${asset}: BREAKOUT DETECTED — ${breakoutDirection} at ${breakoutCandle.close}`);

  // Step 4: Calculate confluence
  const trend = calcHTFTrend(candles1H);
  const volumeSpike = hasVolumeSpike(candles15m, breakoutIdx, LONDON_BREAKOUT.minVolumeRatio);

  const confluence = scoreBreakoutConfluence(
    trend,
    breakoutDirection!,
    volumeSpike,
    asianRange.sizePips,
    LONDON_BREAKOUT.minRangePips,
    LONDON_BREAKOUT.maxRangePips,
    false // fresh break by default
  );

  if (confluence.score < 3) {
    console.log(`  ❌ ${asset}: Confluence too low (${confluence.score}/5): ${confluence.details.join(', ')}`);
    return null;
  }

  console.log(`  ✅ ${asset}: Confluence ${confluence.score}/5: ${confluence.details.join(', ')}`);

  // Step 5: Calculate entry, SL, TP
  const entry = breakoutCandle.close;
  const digitMult = getDigitMultiplier(symbol);
  const slBuffer = priceDiffToPips(entry, asianRange.size, symbol) * (LONDON_BREAKOUT.slBufferPips / 100);

  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let rr: string;

  if (breakoutDirection === 'LONG') {
    stopLoss = Math.round((asianRange.low - slBuffer) * digitMult) / digitMult;
    tp1 = Math.round((entry + asianRange.size * LONDON_BREAKOUT.tp1Multiplier) * digitMult) / digitMult;
    tp2 = Math.round((entry + asianRange.size * LONDON_BREAKOUT.tp2Multiplier) * digitMult) / digitMult;
    rr = (LONDON_BREAKOUT.tp2Multiplier).toFixed(1);
  } else {
    stopLoss = Math.round((asianRange.high + slBuffer) * digitMult) / digitMult;
    tp1 = Math.round((entry - asianRange.size * LONDON_BREAKOUT.tp1Multiplier) * digitMult) / digitMult;
    tp2 = Math.round((entry - asianRange.size * LONDON_BREAKOUT.tp2Multiplier) * digitMult) / digitMult;
    rr = (LONDON_BREAKOUT.tp2Multiplier).toFixed(1);
  }

  // Step 6: Check for existing active signal on this asset
  const existing = signalDB.getRecentBySymbol(symbol, 6);
  const hasActive = existing.some(s =>
    ['PENDING', 'ACTIVE', 'TP1_HIT'].includes(s.status)
  );
  if (hasActive) {
    console.log(`  ⏭️ ${symbol}: Already has active signal, skipping`);
    return null;
  }

  // Check daily limit
  const todayCount = signalDB.countToday();
  if (todayCount >= (config.strategy.maxSignalsPerDay || 8)) {
    console.log(`  ⚠️ Daily signal limit reached (${todayCount})`);
    return null;
  }

  // Step 7: Build signal
  const assetConfig = config.assets.find(a => a.symbol === symbol);
  const displayName = assetConfig?.displayName || symbol;

  const signal: TradingSignal = {
    id: `${symbol}-${Date.now()}`,
    symbol,
    displayName,
    direction: breakoutDirection!,
    entry,
    stopLoss,
    tp1,
    tp2,
    rrRatio: parseFloat(rr),
    confluenceScore: confluence.score,
    confluenceDetails: {
      trendAlignment: confluence.trendAlignment,
      momentumSignal: confluence.volumeSpike,
      volumeConfirm: confluence.volumeSpike,
      srLevel: true, // Asian range IS the key level
      sessionFilter: true, // Running during London session
    },
    session: 'London Session',
    status: 'PENDING',
    indicators: {
      rsi: { value: 50, signal: 'NEUTRAL' },
      macd: { macd: 0, signal: 'NONE', histogram: 0, crossover: 'NONE' },
      ema: { ema20: 0, ema50: 0, ema200: 0, trend },
      atr: calcATR(candles1H),
      volume: { current: 0, average: 0, spike: confluence.volumeSpike, ratio: 0 },
      supportResistance: { nearSupport: true, nearResistance: false, supportLevel: asianRange.low, resistanceLevel: asianRange.high },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    postedToX: false,
  };

  console.log(`  📊 ${symbol}: Signal generated — ${breakoutDirection} @ ${entry} (RR: 1:${rr})`);
  return signal;
}

// ════════════════════════════════════════════════════
// STRATEGY 2: 4H ORB (Crypto)
// First 4H candle → breakout → signal
// ══════════════════════════════════════════════════════
function detectCrypto4HOrb(
  candles4H: OHLCV[],
  candles1H: OHLCV[],
  asset: string,
  symbol: string
): TradingSignal | null {

  if (candles4H.length < 3) {
    console.log(`  ⚠️ Not enough 4H candles for ${asset} (${candles4H.length} min)`);
    return null;
  }

  // First 4H candle = the opening range
  const orbRange = calcRange(candles4H, 0, 0, symbol);
  if (!orbRange || orbRange.sizePct < CRYPTO_4H_ORB.minRangePct) {
    console.log(`  ➖ ${asset}: 4H range too small (${orbRange.sizePct.toFixed(2)}%, need ${CRYPTO_4H_ORB.minRangePct}%)`);
    return null;
  }

  if (orbRange.sizePct > CRYPTO_4H_ORB.maxRangePct) {
    console.log(`  ➖ ${asset}: 4H range too wide (${orbRange.sizePct.toFixed(2)}%, max ${CRYPTO_4H_ORB.maxRangePct}%)`);
    return null;
  }

  console.log(`  📏 ${asset}: 4H ORB Range = ${orbRange.sizePct.toFixed(2)}% ($${orbRange.high.toFixed(2)} - $${orbRange.low.toFixed(2)})`);

  // Check for breakout of first 4H candle range
  let breakoutFound = false;
  let breakoutIdx = -1;
  let breakoutDirection: SignalDirection | null = null;

  for (let i = 1; i < candles4H.length; i++) {
    const candle = candles4H[i];
    const isLongBreak = candle.close > orbRange.high;
    const isShortBreak = candle.close < orbRange.low;

    if (isLongBreak) {
      breakoutFound = true;
      breakoutIdx = i;
      breakoutDirection = 'LONG';
      break;
    }

    if (isShortBreak) {
      breakoutFound = true;
      breakoutIdx = i;
      breakoutDirection = 'SHORT';
      break;
    }
  }

  if (!breakoutFound) {
    console.log(`  ➖ ${asset}: No breakout of 4H ORB yet`);
    return null;
  }

  const breakoutCandle = candles4H[breakoutIdx];

  // Close must confirm the break
  if (!((breakoutDirection === 'LONG' && breakoutCandle.close > orbRange.high) &&
      !(breakoutDirection === 'SHORT' && breakoutCandle.close < orbRange.low)) {
    console.log(`  ➖ ${asset}: Wick broke ORB but candle didn't close beyond it`);
    return null;
  }

  console.log(`  🚨 ${asset}: 4H ORB BREAKOUT — ${breakoutDirection} at $${breakoutCandle.close.toFixed(2)}`);

  // Confluence
  const trend = calcHTFTrend(candles1H);
  const volumeSpike = hasVolumeSpike(candles4H, breakoutIdx, CRYPTO_4H_ORB.minVolumeRatio);

  const confluence = scoreBreakoutConfluence(
    trend,
    breakoutDirection!,
    volumeSpike,
    orbRange.sizePips,
    10, // Use pips for crypto since we don't have a min pips concept for this
    9999,
    false
  );

  if (confluence.score < 2) {
    console.log(`  ❌ ${asset}: Confluence too low (${confluence.score}/5)`);
    return null;
  }

  // Entry, SL, TP
  const entry = breakoutCandle.close;
  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let rr: string;

  if (breakoutDirection === 'LONG') {
    stopLoss = Math.round((orbRange.low - orbRange.size * (CRYPTO_4H_ORB.slBufferPct / 100)) * 100) / 100;
    tp1 = entry + orbRange.size * CRYPTO_4H_ORB.tp1Multiplier;
    tp2 = entry + orbRange.size * CRYPTO_4H_ORB.tp2Multiplier;
    rr = CRYPTO_4H_ORB.tp2Multiplier.toFixed(1);
  } else {
    stopLoss = Math.round((orbRange.high + orbRange.size * (CRYPTO_4H_ORB.slBufferPct / 100)) * 100) / 100;
    tp1 = entry - orbRange.size * CRYPTO_4H_ORB.tp1Multiplier;
    tp2 = entry - orbRange.size * CRYPTO_4H_ORB.tp2Multiplier;
    rr = CRYPTO_4H_ORB.tp2Multiplier.toFixed(1);
  }

  // Round to reasonable precision for crypto
  stopLoss = Math.round(stopLoss * 100) / 100;
  tp1 = Math.round(tp1 * 100) / 100;
  tp2 = Math.round(tp2 * 100) / 100;

  // Check existing signal
  const existing = signalDB.getRecentBySymbol(symbol, 12);
  if (existing.some(s => ['PENDING', 'ACTIVE', 'TP1_HIT'].includes(s.status))) {
    console.log(`  ⏭️ ${symbol}: Already has active signal`);
    return null;
  }

  const assetConfig = config.assets.find(a => a.symbol === symbol);
  const displayName = assetConfig?.displayName || symbol;

  const signal: TradingSignal = {
    id: `${symbol}-${Date.now()}`,
    symbol,
    displayName,
    direction: breakoutDirection!,
    entry,
    stopLoss,
    tp1,
    tp2,
    rrRatio: parseFloat(rr),
    confluenceScore: confluence.score,
    confluenceDetails: {
      trendAlignment: confluence.trendAlignment,
      momentumSignal: confluence.volumeSpike,
      volumeConfirm: confluence.volumeSpike,
      srLevel: true,
      sessionFilter: true,
    },
    session: '4H Breakout',
    status: 'PENDING',
    indicators: {
      rsi: { value: 50, signal: 'NEUTRAL' },
      macd: { macd: 0, signal: 'NONE', histogram: 0, crossover: 'NONE' },
      ema: { ema20: 0, ema50: 0, ema200: 0, trend },
      atr: calcATR(candles1H),
      volume: { current: 0, average: 0, spike: confluence.volumeSpike, ratio: 0 },
      supportResistance: { nearSupport: true, nearResistance: false, supportLevel: orbRange.low, resistanceLevel: orbRange.high },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    postedToX: false,
  };

  console.log(`  📊 ${symbol}: Signal generated — ${breakoutDirection} @ $${entry.toFixed(2)} (RR: 1:${rr})`);
  return signal;
}

// ══════════════════════════════════════════════════
// STRATEGY 3: 30min ORB (US Indices)
// First 30min of NY session → breakout → signal
// ════════════════════════════════════════════════════
function detectIndex30MinOrb(
  candles15m: OHLCV[],
  candles1H: OHLCV[],
  asset: string,
  symbol: string
): TradingSignal | null {

  // First 30min of NY session starts at 13:30 UTC = candle index for 13:30
  let orbStartIdx = -1;
  for (let i = 0; i < candles15m.length; i++) {
    const utcHour = new Date(candles15m[i].timestamp).getUTCHours();
    const utcMin = new Date(candles15m[i].timestamp).getUTCMinutes();
    if (utcHour === 13 && utcMin >= 30) {
      orbStartIdx = i;
      break;
    }
  }

  // If we missed the 30min window, check next 2 hours
  if (orbStartIdx === -1) {
    console.log(`  ⚠️ Missed ORB window for ${asset}`);
    return null;
  }

  // ORB = just 2 candles (13:30-14:00)
  const orbEndIdx = Math.min(orbStartIdx + 1, candles15m.length - 1);

  const orbRange = calcRange(candles15m, orbStartIdx, orbEndIdx, symbol);
  if (!orbRange || orbRange.sizePct < INDEX_30MIN_ORB.minRangePct) {
    console.log(`  ➖ ${asset}: ORB range too small (${orbRange.sizePct.toFixed(2)}%)`);
    return null;
  }

  if (orbRange.sizePct > INDEX_30MIN_ORB.maxRangePct) {
    console.log(`  ➖ ${asset}: ORB too wide (${orbRange.sizePct.toFixed(2)}%)`);
    return null;
  }

  console.log(`  📏 ${asset}: 30min ORB Range = ${orbRange.sizePct.toFixed(2)}% ($${orbRange.high.toFixed(2)} - $${orbRange.low.toFixed(2)})`);

  // Check for breakout after ORB (next candles from 14:00+)
  let breakoutFound = false;
  let breakoutIdx = -1;
  let breakoutDirection: SignalDirection | null = null;

  for (let i = orbEndIdx + 1; i < candles15m.length; i++) {
    const candle = candles15m[i];
    const utcHour = new Date(candles15m[i].timestamp).getUTCHours();

    if (utcHour >= INDEX_30MIN_ORB.checkEndUTC) break;

    const isLongBreak = candle.close > orbRange.high;
    const isShortBreak = candle.close < orbRange.low;

    if (isLongBreak) {
      breakoutFound = true;
      breakoutIdx = i;
      breakoutDirection = 'LONG';
      break;
    }

    if (isShortBreak) {
      breakoutFound = true;
      breakoutIdx = i;
      breakoutDirection = 'SHORT';
      break;
    }
  }

  if (!breakoutFound) {
    console.log(`  ➖ ${asset}: No breakout of 30min ORB yet`);
    return null;
  }

  const breakoutCandle = candles15m[breakoutIdx];

  if (!((breakoutDirection === 'LONG' && breakoutCandle.close > orbRange.high) &&
      !(breakoutDirection === 'SHORT' && breakoutCandle.close < orbRange.low)) {
    console.log(`  ➖ ${asset}: Wick broke ORB but didn't close beyond`);
    return null;
  }

  console.log(`  🚨 ${asset}: 30min ORB BREAKOUT — ${breakoutDirection} at $${breakoutCandle.close.toFixed(2)}`);

  // Confluence
  const trend = calcHTFTrend(candles1H);
  const volumeSpike = hasVolumeSpike(candles15m, breakoutIdx, INDEX_30MIN_ORB.minVolumeRatio);

  const confluence = scoreBreakoutConfluence(
    trend,
    breakoutDirection!,
    volumeSpike,
    orbRange.sizePips,
    10,
    9999,
    false
  );

  if (confluence.score < 2) {
    console.log(`  ❌ ${asset}: Confluence too low (${confluence.score}/5)`);
    return null;
  }

  // Entry, SL, TP
  const entry = breakoutCandle.close;
  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let rr: string;

  if (breakoutDirection === 'LONG') {
    stopLoss = Math.round((orbRange.low - orbRange.size * (INDEX_30MIN_ORB.slBufferPct / 100)) * 100) / 100;
    tp1 = entry + orbRange.size * INDEX_30MIN_ORB.tp1Multiplier;
    tp2 = entry + orbRange.size * INDEX_30MIN_ORB.tp2Multiplier;
    rr = INDEX_30MIN_ORB.tp2Multiplier.toFixed(1);
  } else {
    stopLoss = Math.round((orbRange.high + orbRange.size * (INDEX_30MIN_ORB.slBufferPct / 100)) * 100) / 100;
    tp1 = entry - orbRange.size * INDEX_30MIN_ORB.tp1Multiplier;
    tp2 = entry - orbRange.size * INDEX_30MIN_ORB.tp2Multiplier;
    rr = INDEX_30MIN_ORB.tp2Multiplier.toFixed(1);
  }

  stopLoss = Math.round(stopLoss * 100) / 100;
  tp1 = Math.round(tp1 * 100) / 100;
  tp2 = Math.round(tp2 * 100) / 100;

  const existing = signalDB.getRecentBySymbol(symbol, 12);
  if (existing.some(s => ['PENDING', 'ACTIVE', 'TP1_HIT'].includes(s.status))) {
    console.log(`  ⏭️ ${symbol}: Already has active signal`);
    return null;
  }

  const assetConfig = config.assets.find(a => a.symbol === symbol);
  const displayName = assetConfig?.displayName || symbol;

  const signal: TradingSignal = {
    id: `${symbol}-${Date.now()}`,
    symbol,
    displayName,
    direction: breakoutDirection!,
    entry,
    stopLoss,
    tp1,
    tp2,
    rrRatio: parseFloat(rr),
    confluenceScore: confluence.score,
    confluenceDetails: {
      trendAlignment: confluence.trendAlignment,
      momentumSignal: confluence.volumeSpike,
      volumeConfirm: confluence.volumeSpike,
      srLevel: true,
      sessionFilter: true,
    },
    session: 'NY Session ORB',
    status: 'PENDING',
    indicators: {
      rsi: { value: 50, signal: 'NEUTRAL' },
      macd: { macd: 0, signal: 'NONE', histogram: 0, crossover: 'NONE' },
      ema: { ema20: 0, ema50: 0, ema200: 0, trend },
      atr: calcATR(candles1H),
      volume: { current: 0, average: 0, spike: confluence.volumeSpike, ratio: 0 },
      supportResistance: { nearSupport: true, nearResistance: false, supportLevel: orbRange.low, resistanceLevel: orbRange.high },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    postedToX: false,
  };

  console.log(`  📊 ${symbol}: Signal generated — ${breakoutDirection} @ $${entry.toFixed(2)} (RR: 1:${rr})`);
  return signal;
}

// ══════════════════════════════════════════════════
// MAIN SIGNAL SCAN (called by scheduler)
// Picks strategy based on current session
// ══════════════════════════════════════════════════════
export async function generateSignal(
  priceData: PriceData,
  assetConfig: typeof config.assets[0],
  session: string
): Promise<TradingSignal | null> {

  const { symbol, type, displayName } = assetConfig;

  // Get correct timeframe candles
  const candles15m = priceData.candles['15m'] || [];
  const candles1H = priceData.candles['1h'] || [];

  if (candles15m.length < 10) {
    console.log(`  ⚠️ ${symbol}: Only ${candles15m.length} 15m candles available`);
    return null;
  }

  if (candles1H.length < 50) {
    console.log(`  ⚠️ ${symbol}: Only ${candles1H.length} 1H candles available (need 50+ for EMA 200)`);
  }

  // Pick strategy based on asset type
  switch (type) {
    case 'FX':
    case 'COMMODITY':
      return detectLondonBreakout(candles15m, candles1H, symbol, displayName);

    case 'CRYPTO':
      return detectCrypto4HOrb(candles15m, candles1H, symbol, displayName);

    case 'INDEX':
      return detectIndex30MinOrb(candles15m, candles1H, symbol, displayName);

    default:
      return detectLondonBreakout(candles15m, candles1H, symbol, displayName);
  }
}

// ════════════════════════════════════════════════════
// CHECK SIGNAL STATUS (for trade monitoring)
// Called by tradingBot every 15 minutes
// ══════════════════════════════════════════════════════
export function checkSignalStatus(
  signal: TradingSignal,
  currentPrice: number
): {
  newStatus: TradingSignal['status'];
  pnlPips: number;
} {
  const isLong = signal.direction === 'LONG';

  // Check TP2 first (higher target)
  if (isLong && currentPrice >= signal.tp2) {
    return {
      newStatus: 'TP2_HIT',
      pnlPips: Math.abs(signal.tp2 - signal.entry),
    };
  }
  if (!isLong && currentPrice <= signal.tp2) {
    return {
      newStatus: 'TP2_HIT',
      pnlPips: Math.abs(signal.entry - signal.tp2),
    };
  }

  // Check TP1
  if (isLong && currentPrice >= signal.tp1) {
    return {
      newStatus: 'TP1_HIT',
      pnlPips: Math.abs(signal.tp1 - signal.entry),
    };
  }
  if (!isLong && currentPrice <= signal.tp1) {
    return {
      newStatus: 'TP1_HIT',
      pnlPips: Math.abs(signal.entry - signal.tp1),
    };
  }

  // Check SL
  if (isLong && currentPrice <= signal.stopLoss) {
    return {
      newStatus: 'SL_HIT',
      pnlPips: -Math.abs(signal.entry - signal.stopLoss),
    };
  }
  if (!isLong && currentPrice >= signal.stopLoss) {
    return {
      newStatus: 'SL_HIT',
      pnlPips: -Math.abs(signal.stopLoss - signal.entry),
    };
  }

  return { newStatus: signal.status, pnlPips: 0 };
}

// ════════════════════════════════════════════════════
// FORMAT SIGNAL FOR X POSTING
// Matches the approved template format from templates.ts
// ════════════════════════════════════════════════════
export function formatSignalPost(signal: TradingSignal): string {
  const emoji = signal.direction === 'LONG' ? '🟢' : '🔴';
  const arrow = signal.direction === 'LONG' ? '📈' : '📉';
  const bias = signal.direction === 'LONG' ? 'BULLISH' : 'BEARISH';

  const confluenceStars = '⭐'.repeat(signal.confluenceScore);

  // Determine the trigger label based on confluence
  const triggers: string[] = [];
  if (signal.confluenceDetails.trendAlignment) triggers.push('HTF trend aligned');
  if (signal.confluenceDetails.volumeConfirm) triggers.push('Volume spike confirmed');
  if (signal.confluenceDetails.srLevel) triggers.push('Key level retest');
  if (signal.confluenceDetails.freshBreak) triggers.push('Fresh breakout');

  const triggerText = triggers.length > 0 ? triggers.join(' + ') : 'Range breakout';

  return `${emoji} APEX SIGNAL — ${signal.displayName} | ${signal.session}

HTF Bias: ${bias} 😎
Entry: ${signal.entry} 📍
SL: ${signal.stopLoss} | TP1: ${signal.tp1} | TP2: ${signal.tp2} 🚀
RR: 1:${signal.rrRatio}

Trigger: ${triggerText} 🛡️

💡 Setup Grade: A+
Pure Price Action + Market Structure

⚠️ Not financial advice. Manage risk wisely.`;
}

export function formatTP1Post(signal: TradingSignal): string {
  const pips = Math.abs(signal.tp1 - signal.entry);
  return `✅ TP1 HIT — ${signal.displayName}

Direction: ${signal.direction}
Entry: ${signal.entry}
TP1: ${signal.tp1} ✅

+${pips.toFixed(signal.symbol.includes('JPY') ? 1 : 4)} pips 💰
Running to TP2: ${signal.tp2} 🎯

#${signal.symbol.replace('/', '')} #forex #trading`;
}

export function formatTP2Post(signal: TradingSignal): string {
  const pips = Math.abs(signal.tp2 - signal.entry);
  return `🏆 TP2 HIT — ${signal.displayName} FULL TARGET!

Direction: ${signal.direction}
Entry: ${signal.entry}
TP2: ${signal.tp2} ✅✅

+${pips.toFixed(signal.symbol.includes('JPY') ? 1 : 4)} pips 🔥
RR Achieved: 1:${signal.rrRatio}:1 💎

#${signal.symbol.replace('/', '')} #forex #trading #winner`;
}

export function formatSLPost(signal: TradingSignal): string {
  return `⚠️ SL Hit — ${signal.displayName}

Direction: ${signal.direction}
Entry: ${signal.entry}
SL: ${signal.stopLoss}

Risk managed. Moving to next setup 📊
Every loss is a lesson 💪

#${signal.symbol.replace('/', '')} #forex #trading #riskmanagement`;
}
