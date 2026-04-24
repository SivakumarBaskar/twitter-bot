cat > src/metaLearning.ts << 'ENDOFFILE'
// @ts-nocheck
// ════════════════════════════════════════════════════
// APEX BOT v7.0 — META LEARNING
// ════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';
import { tradeDB, adaptiveDB, eventDB } from './database';
import { sendTelegram } from './telegram';
import { getUniqueTemplate } from './templates';
import { getContentInsights } from './contentLearning';
import {
  launchBrowser,
  loginToX,
  postTweet,
  closeBrowser,
} from './puppeteerEngine';
import type {
  PerformanceMetrics,
  AssetPerformance,
  SessionPerformance,
  TradeRecord,
} from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// ════════════════════════════════════════════════════
// WEEKLY ANALYSIS
// ════════════════════════════════════════════════════
export async function runWeeklyAnalysis(): Promise<PerformanceMetrics> {
  console.log('\n🧠 Running weekly analysis...');
  const trades = tradeDB.getLast7Days();

  if (trades.length === 0) {
    return buildEmptyMetrics();
  }

  const wins = trades.filter(t => t.pnlPips > 0).length
