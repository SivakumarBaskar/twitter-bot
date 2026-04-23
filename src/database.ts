import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import type {
  TradeRecord,
  GiveawayPost,
  AdaptiveParams,
  TradingSignal,
} from './types';

const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.database.path);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      display_name TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      rr_ratio REAL NOT NULL,
      confluence_score INTEGER NOT NULL,
      confluence_details TEXT NOT NULL,
      session TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      indicators TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      posted_to_x INTEGER DEFAULT 0,
      x_post_id TEXT,
      tp1_hit_at INTEGER,
      tp2_hit_at INTEGER,
      sl_hit_at INTEGER,
      pnl_pips REAL
    );

    CREATE TABLE IF NOT EXISTS trade_records (
      id TEXT PRIMARY KEY,
      signal_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry REAL NOT NULL,
      exit_price REAL NOT NULL,
      stop_loss REAL NOT NULL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      status TEXT NOT NULL,
      pnl_pips REAL NOT NULL,
      pnl_percent REAL NOT NULL,
      confluence_score INTEGER NOT NULL,
      session TEXT NOT NULL,
      rsi_at_entry REAL NOT NULL,
      macd_at_entry TEXT NOT NULL,
      trend_at_entry TEXT NOT NULL,
      atr_at_entry REAL NOT NULL,
      created_at INTEGER NOT NULL,
      closed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS giveaway_posts (
      id TEXT PRIMARY KEY,
      account_handle TEXT NOT NULL,
      post_id TEXT NOT NULL UNIQUE,
      post_url TEXT NOT NULL,
      post_text TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      is_giveaway INTEGER DEFAULT 0,
      reply_type TEXT,
      replied INTEGER DEFAULT 0,
      replied_at INTEGER,
      liked INTEGER DEFAULT 0,
      retweeted INTEGER DEFAULT 0,
      quoted INTEGER DEFAULT 0,
      ai_comment TEXT,
      currency TEXT
    );

    CREATE TABLE IF NOT EXISTS adaptive_params (
      symbol TEXT PRIMARY KEY,
      rsi_overbought REAL NOT NULL DEFAULT 70,
      rsi_oversold REAL NOT NULL DEFAULT 30,
      min_confluence_score INTEGER NOT NULL DEFAULT 3,
      preferred_sessions TEXT NOT NULL DEFAULT '[]',
      tp1_multiplier REAL NOT NULL DEFAULT 2.0,
      tp2_multiplier REAL NOT NULL DEFAULT 3.5,
      sl_multiplier REAL NOT NULL DEFAULT 1.5,
      risk_percent REAL NOT NULL DEFAULT 1.5,
      last_updated INTEGER NOT NULL,
      update_reason TEXT NOT NULL DEFAULT 'initial'
    );

    CREATE TABLE IF NOT EXISTS daily_actions (
      date TEXT PRIMARY KEY,
      action_count INTEGER NOT NULL DEFAULT 0,
      last_action_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS bot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS performance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start INTEGER NOT NULL,
      week_end INTEGER NOT NULL,
      total_trades INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      avg_rr REAL NOT NULL,
      total_pips REAL NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
    CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);
    CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trade_records(symbol);
    CREATE INDEX IF NOT EXISTS idx_trades_created ON trade_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_giveaway_post_id ON giveaway_posts(post_id);
    CREATE INDEX IF NOT EXISTS idx_giveaway_handle ON giveaway_posts(account_handle);
  `);

  console.log('✅ Database initialized successfully');
}

export const signalDB = {
  save(signal: TradingSignal): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO signals (
        id, symbol, display_name, direction, entry,
        stop_loss, tp1, tp2, rr_ratio, confluence_score,
        confluence_details, session, status, indicators,
        created_at, updated_at, posted_to_x, x_post_id,
        tp1_hit_at, tp2_hit_at, sl_hit_at, pnl_pips
      ) VALUES (
        @id, @symbol, @displayName, @direction, @entry,
        @stopLoss, @tp1, @tp2, @rrRatio, @confluenceScore,
        @confluenceDetails, @session, @status, @indicators,
        @createdAt, @updatedAt, @postedToX, @xPostId,
        @tp1HitAt, @tp2HitAt, @slHitAt, @pnlPips
      )
    `);
    stmt.run({
      id: signal.id, symbol: signal.symbol, displayName: signal.displayName,
      direction: signal.direction, entry: signal.entry, stopLoss: signal.stopLoss,
      tp1: signal.tp1, tp2: signal.tp2, rrRatio: signal.rrRatio,
      confluenceScore: signal.confluenceScore,
      confluenceDetails: JSON.stringify(signal.confluenceDetails),
      session: signal.session, status: signal.status,
      indicators: JSON.stringify(signal.indicators),
      createdAt: signal.createdAt, updatedAt: signal.updatedAt,
      postedToX: signal.postedToX ? 1 : 0, xPostId: signal.xPostId || null,
      tp1HitAt: signal.tp1HitAt || null, tp2HitAt: signal.tp2HitAt || null,
      slHitAt: signal.slHitAt || null, pnlPips: signal.pnlPips || null,
    });
  },

  getActive(): TradingSignal[] {
    const rows = db.prepare(`
      SELECT * FROM signals
      WHERE status IN ('PENDING', 'ACTIVE', 'TP1_HIT')
      ORDER BY created_at DESC
    `).all() as any[];
    return rows.map(parseSignalRow);
  },

  getById(id: string): TradingSignal | null {
    const row = db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as any;
    return row ? parseSignalRow(row) : null;
  },

  updateStatus(id: string, status: string, extra: Record<string, any> = {}): void {
    const updates = [
      'status = @status', 'updated_at = @updatedAt',
      ...Object.keys(extra).map(k => `${toSnake(k)} = @${k}`),
    ].join(', ');
    db.prepare(`UPDATE signals SET ${updates} WHERE id = @id`).run({
      id, status, updatedAt: Date.now(), ...extra,
    });
  },

  markPosted(id: string, xPostId: string): void {
    db.prepare(`
      UPDATE signals SET posted_to_x = 1, x_post_id = ?, updated_at = ? WHERE id = ?
    `).run(xPostId, Date.now(), id);
  },

  getRecentBySymbol(symbol: string, hours = 24): TradingSignal[] {
    const since = Date.now() - hours * 60 * 60 * 1000;
    const rows = db.prepare(`
      SELECT * FROM signals WHERE symbol = ? AND created_at > ? ORDER BY created_at DESC
    `).all(symbol, since) as any[];
    return rows.map(parseSignalRow);
  },

  countToday(): number {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM signals WHERE created_at > ?
    `).get(midnight.getTime()) as any;
    return result.count;
  },
};

export const tradeDB = {
  save(record: TradeRecord): void {
    db.prepare(`
      INSERT OR IGNORE INTO trade_records (
        id, signal_id, symbol, direction, entry, exit_price,
        stop_loss, tp1, tp2, status, pnl_pips, pnl_percent,
        confluence_score, session, rsi_at_entry, macd_at_entry,
        trend_at_entry, atr_at_entry, created_at, closed_at
      ) VALUES (
        @id, @signalId, @symbol, @direction, @entry, @exit,
        @stopLoss, @tp1, @tp2, @status, @pnlPips, @pnlPercent,
        @confluenceScore, @session, @rsiAtEntry, @macdAtEntry,
        @trendAtEntry, @atrAtEntry, @createdAt, @closedAt
      )
    `).run({
      id: record.id, signalId: record.signalId, symbol: record.symbol,
      direction: record.direction, entry: record.entry, exit: record.exit,
      stopLoss: record.stopLoss, tp1: record.tp1, tp2: record.tp2,
      status: record.status, pnlPips: record.pnlPips, pnlPercent: record.pnlPercent,
      confluenceScore: record.confluenceScore, session: record.session,
      rsiAtEntry: record.rsiAtEntry, macdAtEntry: record.macdAtEntry,
      trendAtEntry: record.trendAtEntry, atrAtEntry: record.atrAtEntry,
      createdAt: record.createdAt, closedAt: record.closedAt,
    });
  },

  getLast30Days(): TradeRecord[] {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return db.prepare(`SELECT * FROM trade_records WHERE created_at > ? ORDER BY created_at DESC`).all(since) as TradeRecord[];
  },

  getLast7Days(): TradeRecord[] {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return db.prepare(`SELECT * FROM trade_records WHERE created_at > ? ORDER BY created_at DESC`).all(since) as TradeRecord[];
  },

  getBySymbol(symbol: string, limit = 20): TradeRecord[] {
    return db.prepare(`SELECT * FROM trade_records WHERE symbol = ? ORDER BY created_at DESC LIMIT ?`).all(symbol, limit) as TradeRecord[];
  },

  getWinRate(symbol?: string): number {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const query = symbol
      ? `SELECT COUNT(*) as total, SUM(CASE WHEN pnl_pips > 0 THEN 1 ELSE 0 END) as wins FROM trade_records WHERE symbol = ? AND created_at > ?`
      : `SELECT COUNT(*) as total, SUM(CASE WHEN pnl_pips > 0 THEN 1 ELSE 0 END) as wins FROM trade_records WHERE created_at > ?`;
    const result = symbol
      ? db.prepare(query).get(symbol, since) as any
      : db.prepare(query).get(since) as any;
    if (!result || result.total === 0) return 0;
    return (result.wins / result.total) * 100;
  },
};

export const giveawayDB = {
  hasProcessed(postId: string): boolean {
    const result = db.prepare('SELECT id FROM giveaway_posts WHERE post_id = ?').get(postId);
    return !!result;
  },

  save(post: GiveawayPost): void {
    db.prepare(`
      INSERT OR IGNORE INTO giveaway_posts (
        id, account_handle, post_id, post_url, post_text,
        detected_at, is_giveaway, reply_type, replied,
        replied_at, liked, retweeted, quoted, ai_comment, currency
      ) VALUES (
        @id, @accountHandle, @postId, @postUrl, @postText,
        @detectedAt, @isGiveaway, @replyType, @replied,
        @repliedAt, @liked, @retweeted, @quoted, @aiComment, @currency
      )
    `).run({
      id: post.id, accountHandle: post.accountHandle, postId: post.postId,
      postUrl: post.postUrl, postText: post.postText, detectedAt: post.detectedAt,
      isGiveaway: post.isGiveaway ? 1 : 0, replyType: post.replyType || null,
      replied: post.replied ? 1 : 0, repliedAt: post.repliedAt || null,
      liked: post.liked ? 1 : 0, retweeted: post.retweeted ? 1 : 0,
      quoted: post.quoted ? 1 : 0, aiComment: post.aiComment || null,
      currency: post.currency || null,
    });
  },

  markReplied(postId: string): void {
    db.prepare(`UPDATE giveaway_posts SET replied = 1, replied_at = ? WHERE post_id = ?`).run(Date.now(), postId);
  },

  getTodayCount(): number {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const result = db.prepare(`SELECT COUNT(*) as count FROM giveaway_posts WHERE replied = 1 AND replied_at > ?`).get(midnight.getTime()) as any;
    return result.count;
  },

  getRecent(limit = 10): GiveawayPost[] {
    return db.prepare(`SELECT * FROM giveaway_posts WHERE is_giveaway = 1 ORDER BY detected_at DESC LIMIT ?`).all(limit) as any[];
  },
};

export const adaptiveDB = {
  get(symbol: string): AdaptiveParams {
    const row = db.prepare('SELECT * FROM adaptive_params WHERE symbol = ?').get(symbol) as any;
    if (!row) {
      return {
        symbol, rsiOverbought: 70, rsiOversold: 30, minConfluenceScore: 3,
        preferredSessions: [], tp1Multiplier: 2.0, tp2Multiplier: 3.5,
        slMultiplier: 1.5, riskPercent: 1.5, lastUpdated: Date.now(), updateReason: 'default',
      };
    }
    return {
      symbol: row.symbol, rsiOverbought: row.rsi_overbought, rsiOversold: row.rsi_oversold,
      minConfluenceScore: row.min_confluence_score,
      preferredSessions: JSON.parse(row.preferred_sessions),
      tp1Multiplier: row.tp1_multiplier, tp2Multiplier: row.tp2_multiplier,
      slMultiplier: row.sl_multiplier, riskPercent: row.risk_percent,
      lastUpdated: row.last_updated, updateReason: row.update_reason,
    };
  },

  save(params: AdaptiveParams): void {
    db.prepare(`
      INSERT OR REPLACE INTO adaptive_params (
        symbol, rsi_overbought, rsi_oversold, min_confluence_score, preferred_sessions,
        tp1_multiplier, tp2_multiplier, sl_multiplier, risk_percent, last_updated, update_reason
      ) VALUES (
        @symbol, @rsiOverbought, @rsiOversold, @minConfluenceScore, @preferredSessions,
        @tp1Multiplier, @tp2Multiplier, @slMultiplier, @riskPercent, @lastUpdated, @updateReason
      )
    `).run({
      symbol: params.symbol, rsiOverbought: params.rsiOverbought,
      rsiOversold: params.rsiOversold, minConfluenceScore: params.minConfluenceScore,
      preferredSessions: JSON.stringify(params.preferredSessions),
      tp1Multiplier: params.tp1Multiplier, tp2Multiplier: params.tp2Multiplier,
      slMultiplier: params.slMultiplier, riskPercent: params.riskPercent,
      lastUpdated: params.lastUpdated, updateReason: params.updateReason,
    });
  },
};

export const dailyActionsDB = {
  getCount(): number {
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare('SELECT action_count FROM daily_actions WHERE date = ?').get(today) as any;
    return result?.action_count || 0;
  },

  increment(): void {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO daily_actions (date, action_count, last_action_at) VALUES (?, 1, ?)
      ON CONFLICT(date) DO UPDATE SET action_count = action_count + 1, last_action_at = ?
    `).run(today, Date.now(), Date.now());
  },

  isUnderLimit(): boolean {
    return this.getCount() < 20;
  },
};

export const eventDB = {
  log(type: string, message: string, data?: any): void {
    db.prepare(`INSERT INTO bot_events (event_type, message, data, created_at) VALUES (?, ?, ?, ?)`).run(type, message, data ? JSON.stringify(data) : null, Date.now());
  },

  getRecent(limit = 50): any[] {
    return db.prepare(`SELECT * FROM bot_events ORDER BY created_at DESC LIMIT ?`).all(limit) as any[];
  },
};

function parseSignalRow(row: any): TradingSignal {
  return {
    id: row.id, symbol: row.symbol, displayName: row.display_name,
    direction: row.direction, entry: row.entry, stopLoss: row.stop_loss,
    tp1: row.tp1, tp2: row.tp2, rrRatio: row.rr_ratio,
    confluenceScore: row.confluence_score,
    confluenceDetails: JSON.parse(row.confluence_details),
    session: row.session, status: row.status,
    indicators: JSON.parse(row.indicators),
    createdAt: row.created_at, updatedAt: row.updated_at,
    postedToX: row.posted_to_x === 1, xPostId: row.x_post_id || undefined,
    tp1HitAt: row.tp1_hit_at || undefined, tp2HitAt: row.tp2_hit_at || undefined,
    slHitAt: row.sl_hit_at || undefined, pnlPips: row.pnl_pips || undefined,
  };
}

function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

initDatabase();

export default db;
