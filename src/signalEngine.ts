import {
  RSI, MACD, EMA, ATR,
} from 'technicalindicators';
import { config } from './config';
import { adaptiveDB, signalDB } from './database';
import type {
  PriceData, OHLCV, Indicators,
  TradingSignal, SignalDirection,
} from './types';

// ════════════════════════════════════════════════════
// CALCULATE ALL INDICATORS
// ════════════════════════════════════════════════════
export function calculateIndicators(
  candles: OHLCV[],
  symbol: string
): Indicators | null {
  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const params = adaptiveDB.get(symbol);

  // ── RSI ───────────────────────────────────────────
  const rsiValues = RSI.calculate({
    values: closes,
    period: config.strategy.rsi.period,
  });
  const rsiValue = rsiValues[rsiValues.length - 1];

  let rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  if (rsiValue >= params.rsiOverbought) rsiSignal = 'OVERBOUGHT';
  else if (rsiValue <= params.rsiOversold) rsiSignal = 'OVERSOLD';
  else rsiSignal = 'NEUTRAL';

  // ── MACD ──────────────────────────────────────────
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: config.strategy.macd.fastPeriod,
    slowPeriod: config.strategy.macd.slowPeriod,
    signalPeriod: config.strategy.macd.signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const macdLast = macdValues[macdValues.length - 1];
  const macdPrev = macdValues[macdValues.length - 2];

  let macdCrossover: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
  if (macdLast && macdPrev) {
    if (macdPrev.histogram! < 0 && macdLast.histogram! > 0) {
      macdCrossover = 'BULLISH';
    } else if (macdPrev.histogram! > 0 && macdLast.histogram! < 0) {
      macdCrossover = 'BEARISH';
    }
  }

  // ── EMA TREND ─────────────────────────────────────
  const ema20Values = EMA.calculate({
    values: closes, period: config.strategy.ema.fast
  });
  const ema50Values = EMA.calculate({
    values: closes, period: config.strategy.ema.slow
  });
  const ema200Values = EMA.calculate({
    values: closes, period: config.strategy.ema.trend
  });

  const ema20  = ema20Values[ema20Values.length - 1];
  const ema50  = ema50Values[ema50Values.length - 1];
  const ema200 = ema200Values[ema200Values.length - 1];
  const price  = closes[closes.length - 1];

  let emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  if (price > ema20 && ema20 > ema50 && ema50 > ema200) {
    emaTrend = 'BULLISH';
  } else if (price < ema20 && ema20 < ema50 && ema50 < ema200) {
    emaTrend = 'BEARISH';
  } else {
    emaTrend = 'NEUTRAL';
  }

  // ── ATR ───────────────────────────────────────────
  const atrValues = ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: config.strategy.atr.period,
  });
  const atrValue = atrValues[atrValues.length - 1];

  // ── VOLUME ────────────────────────────────────────
  const recentVolumes = volumes.slice(-20);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const volumeSpike = volumeRatio >= 1.5; // 50% above average

  // ── SUPPORT & RESISTANCE ──────────────────────────
  const { support, resistance } = findKeyLevels(candles);
  const currentPrice = closes[closes.length - 1];
  const tolerance = atrValue * 0.5;

  return {
    rsi: { value: rsiValue, signal: rsiSignal },
    macd: {
      macd: macdLast?.MACD || 0,
      signal: macdLast?.signal || 0,
      histogram: macdLast?.histogram || 0,
      crossover: macdCrossover,
    },
    ema: { ema20, ema50, ema200, trend: emaTrend },
    atr: atrValue,
    volume: {
      current: currentVolume,
      average: avgVolume,
      spike: volumeSpike,
      ratio: volumeRatio,
    },
    supportResistance: {
      nearSupport: Math.abs(currentPrice - support) <= tolerance,
      nearResistance: Math.abs(currentPrice - resistance) <= tolerance,
      supportLevel: support,
      resistanceLevel: resistance,
    },
  };
}

// ════════════════════════════════════════════════════
// SUPPORT & RESISTANCE DETECTION
// ════════════════════════════════════════════════════
function findKeyLevels(candles: OHLCV[]): {
  support: number;
  resistance: number;
} {
  const recent = candles.slice(-50);
  const highs = recent.map(c => c.high);
  const lows  = recent.map(c => c.low);

  // Find significant swing highs and lows
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < recent.length - 2; i++) {
    // Swing high: higher than 2 candles on each side
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      swingHighs.push(highs[i]);
    }
    // Swing low: lower than 2 candles on each side
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      swingLows.push(lows[i]);
    }
  }

  const currentPrice = recent[recent.length - 1].close;

  // Find nearest support (below price)
  const supports = swingLows.filter(l => l < currentPrice).sort((a,b) => b-a);
  const resistances = swingHighs.filter(h => h > currentPrice).sort((a,b) => a-b);

  return {
    support: supports[0] || Math.min(...lows),
    resistance: resistances[0] || Math.max(...highs),
  };
}

// ════════════════════════════════════════════════════
// CONFLUENCE SCORING (APEX Strategy)
// ════════════════════════════════════════════════════
function scoreConfluence(
  indicators: Indicators,
  direction: SignalDirection,
  symbol: string,
  session: string
): {
  score: number;
  details: TradingSignal['confluenceDetails'];
} {
  const params = adaptiveDB.get(symbol);
  const details: TradingSignal['confluenceDetails'] = {
    trendAlignment: false,
    momentumSignal: false,
    volumeConfirm: false,
    srLevel: false,
    sessionFilter: false,
  };

  // Layer 1: Trend Alignment
  if (direction === 'LONG' && indicators.ema.trend === 'BULLISH') {
    details.trendAlignment = true;
  } else if (direction === 'SHORT' && indicators.ema.trend === 'BEARISH') {
    details.trendAlignment = true;
  }

  // Layer 2: Momentum Signal (RSI + MACD)
  if (direction === 'LONG') {
    const rsiOk = indicators.rsi.value > 40 && indicators.rsi.value < 65;
    const macdOk = indicators.macd.crossover === 'BULLISH' ||
                   indicators.macd.histogram > 0;
    if (rsiOk && macdOk) details.momentumSignal = true;
  } else {
    const rsiOk = indicators.rsi.value > 45 && indicators.rsi.value < 70;
    const macdOk = indicators.macd.crossover === 'BEARISH' ||
                   indicators.macd.histogram < 0;
    if (rsiOk && macdOk) details.momentumSignal = true;
  }

  // Layer 3: Volume Confirmation
  if (indicators.volume.spike || indicators.volume.ratio >= 1.2) {
    details.volumeConfirm = true;
  }

  // Layer 4: Support/Resistance Level
  if (direction === 'LONG' && indicators.supportResistance.nearSupport) {
    details.srLevel = true;
  } else if (direction === 'SHORT' && indicators.supportResistance.nearResistance) {
    details.srLevel = true;
  }

  // Layer 5: Session Filter
  const preferredSessions = params.preferredSessions;
  if (preferredSessions.length === 0 || preferredSessions.includes(session)) {
    details.sessionFilter = true;
  }

  const score = Object.values(details).filter(Boolean).length;

  return { score, details };
}

// ════════════════════════════════════════════════════
// SIGNAL DIRECTION DETECTION
// ════════════════════════════════════════════════════
function detectDirection(indicators: Indicators): SignalDirection | null {
  const bullishPoints = [
    indicators.ema.trend === 'BULLISH',
    indicators.rsi.signal === 'OVERSOLD',
    indicators.macd.crossover === 'BULLISH',
    indicators.macd.histogram > 0,
    indicators.supportResistance.nearSupport,
  ].filter(Boolean).length;

  const bearishPoints = [
    indicators.ema.trend === 'BEARISH',
    indicators.rsi.signal === 'OVERBOUGHT',
    indicators.macd.crossover === 'BEARISH',
    indicators.macd.histogram < 0,
    indicators.supportResistance.nearResistance,
  ].filter(Boolean).length;

  if (bullishPoints >= 3 && bullishPoints > bearishPoints) return 'LONG';
  if (bearishPoints >= 3 && bearishPoints > bullishPoints) return 'SHORT';
  return null; // No clear direction
}

// ════════════════════════════════════════════════════
// CALCULATE ENTRY, SL, TP
// ════════════════════════════════════════════════════
function calculateLevels(
  priceData: PriceData,
  direction: SignalDirection,
  indicators: Indicators,
  symbol: string
): {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rrRatio: number;
} {
  const params = adaptiveDB.get(symbol);
  const atr = indicators.atr;
  const entry = priceData.current;
  const digits = getDigits(priceData.symbol);

  let stopLoss: number;
  let tp1: number;
  let tp2: number;

  if (direction === 'LONG') {
    stopLoss = round(entry - (atr * params.slMultiplier), digits);
    tp1 = round(entry + (atr * params.tp1Multiplier), digits);
    tp2 = round(entry + (atr * params.tp2Multiplier), digits);
  } else {
    stopLoss = round(entry + (atr * params.slMultiplier), digits);
    tp1 = round(entry - (atr * params.tp1Multiplier), digits);
    tp2 = round(entry - (atr * params.tp2Multiplier), digits);
  }

  const riskPips = Math.abs(entry - stopLoss);
  const rewardPips = Math.abs(tp1 - entry);
  const rrRatio = round(rewardPips / riskPips, 2);

  return { entry, stopLoss, tp1, tp2, rrRatio };
}

// ════════════════════════════════════════════════════
// GENERATE SIGNAL (Main Entry Point)
// ════════════════════════════════════════════════════
export async function generateSignal(
  priceData: PriceData,
  assetConfig: typeof config.assets[0],
  session: string
): Promise<TradingSignal | null> {

  const { symbol, displayName } = assetConfig;

  // Get adaptive params for this asset
  const params = adaptiveDB.get(symbol);

  // Calculate indicators on 1h candles
  const indicators = calculateIndicators(priceData.candles['1h'], symbol);
  if (!indicators) {
    console.log(`  ⚠️ Insufficient data for ${symbol}`);
    return null;
  }

  // Check for existing active signal on this asset
  const existing = signalDB.getRecentBySymbol(symbol, 4);
  const hasActive = existing.some(s =>
    ['PENDING', 'ACTIVE', 'TP1_HIT'].includes(s.status)
  );
  if (hasActive) {
    console.log(`  ⏭️ ${symbol}: Already has active signal, skipping`);
    return null;
  }

  // Detect signal direction
  const direction = detectDirection(indicators);
  if (!direction) {
    console.log(`  ➖ ${symbol}: No clear direction`);
    return null;
  }

  // Score confluence
  const { score, details } = scoreConfluence(
    indicators, direction, symbol, session
  );

  console.log(`  📊 ${symbol}: Direction=${direction}, Score=${score}/5`);

  // Check minimum score (adaptive per asset)
  if (score < params.minConfluenceScore) {
    console.log(`  ❌ ${symbol}: Score ${score} below minimum ${params.minConfluenceScore}`);
    return null;
  }

  // Check daily signal limit
  const signalsToday = signalDB.countToday();
  if (signalsToday >= config.strategy.maxSignalsPerDay) {
    console.log(`  ⚠️ Daily signal limit reached (${signalsToday})`);
    return null;
  }

  // Calculate entry/SL/TP
  const levels = calculateLevels(priceData, direction, indicators, symbol);

  // Minimum RR check
  if (levels.rrRatio < 1.5) {
    console.log(`  ❌ ${symbol}: RR ratio ${levels.rrRatio} too low`);
    return null;
  }

  // Build signal
  const signal: TradingSignal = {
    id: `${symbol}-${Date.now()}`,
    symbol,
    displayName,
    direction,
    entry: levels.entry,
    stopLoss: levels.stopLoss,
    tp1: levels.tp1,
    tp2: levels.tp2,
    rrRatio: levels.rrRatio,
    confluenceScore: score,
    confluenceDetails: details,
    session,
    status: 'PENDING',
    indicators,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    postedToX: false,
  };

  console.log(`  ✅ ${symbol}: Signal generated! ${direction} @ ${levels.entry}`);
  return signal;
}

// ════════════════════════════════════════════════════
// SIGNAL STATUS CHECKER (for trade monitoring)
// ════════════════════════════════════════════════════
export function checkSignalStatus(
  signal: TradingSignal,
  currentPrice: number
): {
  newStatus: TradingSignal['status'];
  pnlPips: number;
} {
  const isLong = signal.direction === 'LONG';

  // Check TP2
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
// HELPERS
// ════════════════════════════════════════════════════
function getDigits(symbol: string): number {
  if (symbol.includes('JPY')) return 3;
  if (['BTCUSD', 'ETHUSD', 'SPX500', 'NAS100'].includes(symbol)) return 2;
  if (['SOLUSD', 'XAUUSD', 'XAGUSD'].includes(symbol)) return 3;
  return 5; // FX majors
}

function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

// ════════════════════════════════════════════════════
// FORMAT SIGNAL FOR X POST
// ════════════════════════════════════════════════════
export function formatSignalPost(signal: TradingSignal): string {
  const emoji = signal.direction === 'LONG' ? '🟢' : '🔴';
  const dirText = signal.direction === 'LONG' ? 'LONG 📈' : 'SHORT 📉';
  const stars = '⭐'.repeat(signal.confluenceScore);

  return `${emoji} ${signal.displayName} — ${dirText}

📍 Entry: ${signal.entry}
🛡️ Stop Loss: ${signal.stopLoss}
🎯 TP1: ${signal.tp1}
🎯 TP2: ${signal.tp2}
⚡ RR: ${signal.rrRatio}:1
${stars} Confluence: ${signal.confluenceScore}/5

Session: ${signal.session}
Strategy: APEX Hybrid

#${signal.symbol.replace('/', '')} #forex #crypto #trading #signals`;
}

export function formatTP1Post(signal: TradingSignal): string {
  return `✅ TP1 HIT — ${signal.displayName}

Direction: ${signal.direction}
Entry: ${signal.entry}
TP1: ${signal.tp1} ✅

+${Math.abs(signal.tp1 - signal.entry).toFixed(signal.symbol.includes('JPY') ? 1 : 4)} pips 💰
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
RR Achieved: ${signal.rrRatio}:1 💎

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
