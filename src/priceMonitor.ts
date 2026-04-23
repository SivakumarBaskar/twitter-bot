import axios from 'axios';
import yahooFinance from 'yahoo-finance2';
import { config } from './config';
import type { OHLCV, PriceData, PriceSourceResult } from './types';

// ════════════════════════════════════════════════════
// SOURCE A: TWELVE DATA
// ════════════════════════════════════════════════════
async function fetchFromTwelveData(
  symbol: string,
  interval: string,
  outputSize: number = 100
): Promise<OHLCV[] | null> {
  try {
    const url = `${config.priceData.twelveData.baseUrl}/time_series`;
    const response = await axios.get(url, {
      params: {
        symbol,
        interval,
        outputsize: outputSize,
        apikey: config.priceData.twelveData.key,
      },
      timeout: 10000,
    });

    if (response.data.status === 'error') return null;
    if (!response.data.values) return null;

    return response.data.values
      .reverse() // Oldest first
      .map((v: any) => ({
        timestamp: new Date(v.datetime).getTime(),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume || '0'),
      }));

  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════
// SOURCE B: BINANCE (Crypto Only)
// ════════════════════════════════════════════════════
async function fetchFromBinance(
  binanceSymbol: string,
  interval: string,
  limit: number = 100
): Promise<OHLCV[] | null> {
  try {
    // Map our intervals to Binance intervals
    const intervalMap: Record<string, string> = {
      '15min': '15m',
      '1h': '1h',
      '4h': '4h',
      '1day': '1d',
    };

    const binanceInterval = intervalMap[interval] || interval;

    const response = await axios.get(
      `${config.priceData.binance.baseUrl}/api/v3/klines`,
      {
        params: {
          symbol: binanceSymbol,
          interval: binanceInterval,
          limit,
        },
        timeout: 10000,
      }
    );

    return response.data.map((k: any[]) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

  } catch {
    return null;
  }
}

// Get current Binance price
async function getBinancePrice(symbol: string): Promise<number | null> {
  try {
    const response = await axios.get(
      `${config.priceData.binance.baseUrl}/api/v3/ticker/price`,
      { params: { symbol }, timeout: 5000 }
    );
    return parseFloat(response.data.price);
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════
// SOURCE C: YAHOO FINANCE
// ════════════════════════════════════════════════════
async function fetchFromYahoo(
  yahooSymbol: string,
  interval: '15m' | '1h' | '1d',
  range: '1d' | '5d' | '1mo' | '3mo'
): Promise<OHLCV[] | null> {
  try {
    const result = await yahooFinance.chart(yahooSymbol, {
      interval,
      range,
    });

    if (!result.quotes || result.quotes.length === 0) return null;

    return result.quotes
      .filter((q: any) => q.open && q.high && q.low && q.close)
      .map((q: any) => ({
        timestamp: new Date(q.date).getTime(),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume || 0,
      }));

  } catch {
    return null;
  }
}

// Get Yahoo current price
async function getYahooPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quote(yahooSymbol);
    return quote.regularMarketPrice || null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════
// MAIN PRICE FETCHER (with fallback chain)
// ════════════════════════════════════════════════════
export async function fetchPriceData(
  assetConfig: typeof config.assets[0]
): Promise<PriceData | null> {
  const { symbol, type, yahooSymbol, binanceSymbol } = assetConfig;

  console.log(`📊 Fetching price data for ${symbol}...`);

  let candles15m: OHLCV[] | null = null;
  let candles1h: OHLCV[] | null = null;
  let candles4h: OHLCV[] | null = null;
  let candles1d: OHLCV[] | null = null;
  let currentPrice: number | null = null;
  let source: 'TWELVE_DATA' | 'BINANCE' | 'YAHOO' = 'YAHOO';

  // ── CRYPTO: Try Binance first (best free source) ──
  if (type === 'CRYPTO' && binanceSymbol) {
    console.log(`  → Trying Binance for ${symbol}...`);
    candles15m = await fetchFromBinance(binanceSymbol, '15m', 100);
    candles1h  = await fetchFromBinance(binanceSymbol, '1h', 100);
    candles4h  = await fetchFromBinance(binanceSymbol, '4h', 100);
    candles1d  = await fetchFromBinance(binanceSymbol, '1d', 100);
    currentPrice = await getBinancePrice(binanceSymbol);

    if (candles1h && currentPrice) {
      source = 'BINANCE';
      console.log(`  ✅ Binance data received for ${symbol}`);
    }
  }

  // ── ALL ASSETS: Try Twelve Data ───────────────────
  if (!candles1h) {
    console.log(`  → Trying Twelve Data for ${symbol}...`);
    candles15m = await fetchFromTwelveData(symbol, '15min', 100);
    candles1h  = await fetchFromTwelveData(symbol, '1h', 100);
    candles4h  = await fetchFromTwelveData(symbol, '4h', 100);
    candles1d  = await fetchFromTwelveData(symbol, '1day', 100);

    if (candles1h) {
      currentPrice = candles1h[candles1h.length - 1]?.close || null;
      source = 'TWELVE_DATA';
      console.log(`  ✅ Twelve Data received for ${symbol}`);
    }
  }

  // ── FALLBACK: Yahoo Finance ────────────────────────
  if (!candles1h) {
    console.log(`  → Falling back to Yahoo Finance for ${symbol}...`);
    candles15m = await fetchFromYahoo(yahooSymbol, '15m', '1d');
    candles1h  = await fetchFromYahoo(yahooSymbol, '1h', '5d');
    candles1d  = await fetchFromYahoo(yahooSymbol, '1d', '3mo');
    candles4h  = candles1h; // Yahoo doesn't have 4h, use 1h
    currentPrice = await getYahooPrice(yahooSymbol);

    if (candles1h) {
      source = 'YAHOO';
      console.log(`  ✅ Yahoo Finance data received for ${symbol}`);
    }
  }

  // ── ALL SOURCES FAILED ────────────────────────────
  if (!candles1h || !currentPrice) {
    console.error(`  ❌ All price sources failed for ${symbol}`);
    return null;
  }

  // Ensure we have all timeframes
  candles15m = candles15m || candles1h;
  candles4h  = candles4h  || candles1h;

  const previous = candles1h[candles1h.length - 2]?.close || currentPrice;
  const change = currentPrice - previous;
  const changePercent = (change / previous) * 100;

  return {
    symbol,
    current: currentPrice,
    previous,
    change,
    changePercent,
    candles: {
      '15m': candles15m,
      '1h': candles1h,
      '4h': candles4h,
      '1d': candles1d || candles1h,
    },
    source,
    fetchedAt: Date.now(),
  };
}

// ════════════════════════════════════════════════════
// FETCH ALL ASSETS
// ════════════════════════════════════════════════════
export async function fetchAllPrices(): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();

  console.log('\n📡 Fetching all asset prices...');

  // Fetch sequentially to avoid rate limits
  for (const asset of config.assets) {
    try {
      const data = await fetchPriceData(asset);
      if (data) {
        results.set(asset.symbol, data);
      }
      // Small delay between requests
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`Failed to fetch ${asset.symbol}:`, error);
    }
  }

  console.log(`\n✅ Price data fetched: ${results.size}/${config.assets.length} assets`);
  return results;
}

// ════════════════════════════════════════════════════
// PRICE MONITORING (for live trade tracking)
// ════════════════════════════════════════════════════
export async function getCurrentPrice(
  assetConfig: typeof config.assets[0]
): Promise<number | null> {
  const { type, binanceSymbol, yahooSymbol } = assetConfig;

  // Fastest sources first
  if (type === 'CRYPTO' && binanceSymbol) {
    const price = await getBinancePrice(binanceSymbol);
    if (price) return price;
  }

  const yahooPrice = await getYahooPrice(yahooSymbol);
  if (yahooPrice) return yahooPrice;

  return null;
}
