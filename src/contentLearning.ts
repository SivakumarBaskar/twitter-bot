// ════════════════════════════════════════════════════
// APEX BOT v7.0 — CONTENT LEARNING
// Tracks engagement per post
// Learns which categories/times/emojis perform best
// Feeds insights back into content scheduling
// ════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { eventDB } from './database';

// ════════════════════════════════════════════════════
// DATABASE SETUP (separate from main trading DB)
// ════════════════════════════════════════════════════
const contentDbPath = path.join(
  path.dirname(config.database.path),
  'content_learning.db'
);

const contentDb = new Database(contentDbPath);
contentDb.pragma('journal_mode = WAL');
contentDb.pragma('synchronous = NORMAL');

// Initialize tables
contentDb.exec(`
  CREATE TABLE IF NOT EXISTS content_posts (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    post_text TEXT NOT NULL,
    posted_at INTEGER NOT NULL,
    posted_to_x INTEGER DEFAULT 1,
    hour_utc INTEGER NOT NULL,
    day_of_week TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    bookmarks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    engagement_score REAL DEFAULT 0,
    engagement_updated_at INTEGER,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS category_stats (
    category TEXT PRIMARY KEY,
    total_posts INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    total_retweets INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    total_bookmarks INTEGER DEFAULT 0,
    total_impressions INTEGER DEFAULT 0,
    avg_engagement REAL DEFAULT 0,
    best_engagement REAL DEFAULT 0,
    worst_engagement REAL DEFAULT 0,
    last_updated INTEGER
  );

  CREATE TABLE IF NOT EXISTS time_stats (
    hour_utc INTEGER PRIMARY KEY,
    total_posts INTEGER DEFAULT 0,
    total_engagement REAL DEFAULT 0,
    avg_engagement REAL DEFAULT 0,
    best_category TEXT,
    last_updated INTEGER
  );

  CREATE TABLE IF NOT EXISTS day_stats (
    day_of_week TEXT PRIMARY KEY,
    total_posts INTEGER DEFAULT 0,
    total_engagement REAL DEFAULT 0,
    avg_engagement REAL DEFAULT 0,
    best_category TEXT,
    last_updated INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_content_category ON content_posts(category);
  CREATE INDEX IF NOT EXISTS idx_content_posted ON content_posts(posted_at);
`);

console.log('✅ Content learning database initialized');

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════
interface ContentPost {
  id: string;
  category: string;
  postText: string;
  postedAt: number;
  postedToX: boolean;
  hourUtc: number;
  dayOfWeek: string;
  charCount: number;
  likes: number;
  retweets: number;
  replies: number;
  bookmarks: number;
  impressions: number;
  engagementScore: number;
}

interface CategoryStats {
  category: string;
  totalPosts: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  totalBookmarks: number;
  totalImpressions: number;
  avgEngagement: number;
  bestEngagement: number;
  worstEngagement: number;
}

interface TimeStats {
  hourUtc: number;
  totalPosts: number;
  totalEngagement: number;
  avgEngagement: number;
  bestCategory: string | null;
}

interface DayStats {
  dayOfWeek: string;
  totalPosts: number;
  totalEngagement: number;
  avgEngagement: number;
  bestCategory: string | null;
}

interface ContentInsight {
  bestCategory: string;
  bestHour: number;
  bestDay: string;
  worstCategory: string;
  categoryRanking: Array<{ category: string; avgEngagement: number }>;
  timeRanking: Array<{ hour: number; avgEngagement: number }>;
  dayRanking: Array<{ day: string; avgEngagement: number }>;
  totalPostsTracked: number;
}

// ════════════════════════════════════════════════════
// LOG A CONTENT POST
// Called right after posting to X
// ════════════════════════════════════════════════════
export function logContentPost(
  category: string,
  postText: string,
  success: boolean
): string {
  const id = `post-${Date.now()}`;
  const now = Date.now();
  const date = new Date(now);
  const hourUtc = date.getUTCHours();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[date.getUTCDay()];

  contentDb.prepare(`
    INSERT OR IGNORE INTO content_posts (
      id, category, post_text, posted_at, posted_to_x,
      hour_utc, day_of_week, char_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, category, postText.substring(0, 1000), now, success ? 1 : 0,
    hourUtc, dayOfWeek, postText.length
  );

  // Update category stats
  contentDb.prepare(`
    INSERT INTO category_stats (category, total_posts, last_updated)
    VALUES (?, 1, ?)
    ON CONFLICT(category) DO UPDATE SET
      total_posts = total_posts + 1,
      last_updated = ?
  `).run(category, now, now);

  // Update time stats
  contentDb.prepare(`
    INSERT INTO time_stats (hour_utc, total_posts, last_updated)
    VALUES (?, 1, ?)
    ON CONFLICT(hour_utc) DO UPDATE SET
      total_posts = total_posts + 1,
      last_updated = ?
  `).run(hourUtc, now, now);

  // Update day stats
  contentDb.prepare(`
    INSERT INTO day_stats (day_of_week, total_posts, last_updated)
    VALUES (?, 1, ?)
    ON CONFLICT(day_of_week) DO UPDATE SET
      total_posts = total_posts + 1,
      last_updated = ?
  `).run(dayOfWeek, now, now);

  eventDB.log('CONTENT_LEARNING', 'Post logged', {
    id,
    category,
    hourUtc,
    dayOfWeek,
  });

  return id;
}

// ════════════════════════════════════════════════════
// UPDATE ENGAGEMENT FOR A POST
// Call this periodically (manual or via Telegram command)
// You check X analytics and enter the numbers
// ════════════════════════════════════════════════════
export function updatePostEngagement(
  postId: string,
  likes: number,
  retweets: number,
  replies: number,
  bookmarks: number,
  impressions: number
): boolean {
  // Engagement score formula: weighted sum
  // Bookmarks are worth 3x (highest signal to algorithm)
  // Replies worth 2x (conversation starter)
  // Likes worth 1x
  const score = likes * 1 + retweets * 1.5 + replies * 2 + bookmarks * 3;

  const result = contentDb.prepare(`
    UPDATE content_posts
    SET likes = ?, retweets = ?, replies = ?,
        bookmarks = ?, impressions = ?,
        engagement_score = ?,
        engagement_updated_at = ?
    WHERE id = ?
  `).run(likes, retweets, replies, bookmarks, impressions, score, Date.now(), postId);

  if (result.changes > 0) {
    // Recalculate category stats
    recalculateCategoryStats(postId);
    recalculateTimeStats();
    recalculateDayStats();
    return true;
  }

  return false;
}

// ════════════════════════════════════════════════════
// RECALCULATE AGGREGATE STATS
// ════════════════════════════════════════════════════
function recalculateCategoryStats(postId?: string): void {
  if (postId) {
    // Get category of this post
    const post = contentDb.prepare('SELECT category FROM content_posts WHERE id = ?')
      .get(postId) as any;
    if (!post) return;

    const rows = contentDb.prepare(`
      SELECT likes, retweets, replies, bookmarks,
             likes * 1 + retweets * 1.5 + replies * 2 + bookmarks * 3 as score
      FROM content_posts
      WHERE category = ? AND engagement_score > 0
    `).all(post.category) as any[];

    if (rows.length === 0) return;

    const totalScore = rows.reduce((sum, r) => sum + r.score, 0);
    const avgScore = totalScore / rows.length;
    const bestScore = Math.max(...rows.map(r => r.score));
    const worstScore = Math.min(...rows.map(r => r.score));

    const totals = rows.reduce((acc, r) => ({
      likes: acc.likes + r.likes,
      retweets: acc.retweets + r.retweets,
      replies: acc.replies + r.replies,
      bookmarks: acc.bookmarks + r.bookmarks,
    }), { likes: 0, retweets: 0, replies: 0, bookmarks: 0 });

    contentDb.prepare(`
      UPDATE category_stats SET
        total_likes = ?,
        total_retweets = ?,
        total_replies = ?,
        total_bookmarks = ?,
        avg_engagement = ?,
        best_engagement = ?,
        worst_engagement = ?,
        last_updated = ?
      WHERE category = ?
    `).run(
      totals.likes, totals.retweets, totals.replies, totals.bookmarks,
      avgScore, bestScore, worstScore, Date.now(), post.category
    );
  } else {
    // Recalculate ALL categories
    const categories = contentDb.prepare('SELECT DISTINCT category FROM content_posts').all() as any[];

    for (const cat of categories) {
      recalculateCategoryStats(`cat-${cat.category}`);
    }
  }
}

function recalculateTimeStats(): void {
  const rows = contentDb.prepare(`
    SELECT hour_utc,
           likes * 1 + retweets * 1.5 + replies * 2 + bookmarks * 3 as score,
           category
    FROM content_posts
    WHERE engagement_score > 0
  `).all() as any[];

  if (rows.length === 0) return;

  // Group by hour
  const hourMap = new Map<number, { scores: number[]; categories: Map<string, number> }>();

  for (const row of rows) {
    if (!hourMap.has(row.hour_utc)) {
      hourMap.set(row.hour_utc, { scores: [], categories: new Map() });
    }
    const entry = hourMap.get(row.hour_utc)!;
    entry.scores.push(row.score);
    entry.categories.set(row.category, (entry.categories.get(row.category) || 0) + row.score);
  }

  for (const [hour, data] of hourMap) {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;

    // Find best category for this hour
    let bestCat = '';
    let bestCatScore = 0;
    for (const [cat, score] of data.categories) {
      if (score > bestCatScore) {
        bestCatScore = score;
        bestCat = cat;
      }
    }

    contentDb.prepare(`
      INSERT INTO time_stats (hour_utc, total_engagement, avg_engagement, best_category, last_updated)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(hour_utc) DO UPDATE SET
        total_engagement = ?,
        avg_engagement = ?,
        best_category = ?,
        last_updated = ?
    `).run(hour, avg, avg, bestCat, Date.now());
  }
}

function recalculateDayStats(): void {
  const rows = contentDb.prepare(`
    SELECT day_of_week,
           likes * 1 + retweets * 1.5 + replies * 2 + bookmarks * 3 as score,
           category
    FROM content_posts
    WHERE engagement_score > 0
  `).all() as any[];

  if (rows.length === 0) return;

  const dayMap = new Map<string, { scores: number[]; categories: Map<string, number> }>();

  for (const row of rows) {
    if (!dayMap.has(row.day_of_week)) {
      dayMap.set(row.day_of_week, { scores: [], categories: new Map() });
    }
    const entry = dayMap.get(row.day_of_week)!;
    entry.scores.push(row.score);
    entry.categories.set(row.category, (entry.categories.get(row.category) || 0) + row.score);
  }

  for (const [day, data] of dayMap) {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;

    let bestCat = '';
    let bestCatScore = 0;
    for (const [cat, score] of data.categories) {
      if (score > bestCatScore) {
        bestCatScore = score;
        bestCat = cat;
      }
    }

    contentDb.prepare(`
      INSERT INTO day_stats (day_of_week, total_engagement, avg_engagement, best_category, last_updated)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(day_of_week) DO UPDATE SET
        total_engagement = ?,
        avg_engagement = ?,
        best_category = ?,
        last_updated = ?
    `).run(day, avg, avg, bestCat, Date.now());
  }
}

// ════════════════════════════════════════════════════
// GET CONTENT INSIGHTS
// Called by meta-learning for weekly report + Telegram
// ════════════════════════════════════════════════════
export function getContentInsights(): ContentInsight {
  // Best category
  const catRows = contentDb.prepare(`
    SELECT category, avg_engagement
    FROM category_stats
    WHERE total_posts >= 2
    ORDER BY avg_engagement DESC
  `).all() as any[];

  // Best hour
  const timeRows = contentDb.prepare(`
    SELECT hour_utc, avg_engagement
    FROM time_stats
    WHERE total_posts >= 2
    ORDER BY avg_engagement DESC
  `).all() as any[];

  // Best day
  const dayRows = contentDb.prepare(`
    SELECT day_of_week, avg_engagement
    FROM day_stats
    WHERE total_posts >= 2
    ORDER BY avg_engagement DESC
  `).all() as any[];

  // Worst category
  const worstCat = catRows.length > 0
    ? catRows[catRows.length - 1]
    : null;

  // Total posts tracked
  const totalPosts = contentDb.prepare('SELECT COUNT(*) as count FROM content_posts').get() as any;

  return {
    bestCategory: catRows[0]?.category || 'N/A',
    bestHour: timeRows[0]?.hour_utc || 9,
    bestDay: dayRows[0]?.day_of_week || 'N/A',
    worstCategory: worstCat?.category || 'N/A',
    categoryRanking: catRows.map(r => ({
      category: r.category,
      avgEngagement: parseFloat(r.avg_engagement.toFixed(1)),
    })),
    timeRanking: timeRows.map(r => ({
      hour: r.hour_utc,
      avgEngagement: parseFloat(r.avg_engagement.toFixed(1)),
    })),
    dayRanking: dayRows.map(r => ({
      day: r.day_of_week,
      avgEngagement: parseFloat(r.avg_engagement.toFixed(1)),
    })),
    totalPostsTracked: totalPosts?.count || 0,
  };
}

// ════════════════════════════════════════════════════
// GET POSTS THAT NEED ENGAGEMENT UPDATE
// Posts posted but have no engagement data yet
// ════════════════════════════════════════════════════
export function getPostsWithoutEngagement(limit: number = 10): Array<{
  id: string;
  category: string;
  postedAt: string;
  postSnippet: string;
}> {
  const rows = contentDb.prepare(`
    SELECT id, category, posted_at, post_text
    FROM content_posts
    WHERE engagement_score = 0 AND posted_to_x = 1
    ORDER BY posted_at DESC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map(r => ({
    id: r.id,
    category: r.category,
    postedAt: new Date(r.posted_at).toISOString(),
    postSnippet: r.post_text.substring(0, 100),
  }));
}

// ════════════════════════════════════════════════════
// FORMAT INSIGHTS FOR TELEGRAM
// ════════════════════════════════════════════════════
export function formatInsightsForTelegram(): string {
  const insights = getContentInsights();

  if (insights.totalPostsTracked < 3) {
    return '📝 Not enough data yet. Need at least 3 posts with engagement data to generate insights.\n\nUpdate engagement: /update_engagement';
  }

  const lines = [
    '📊 Content Performance Insights\n',
    `Posts tracked: ${insights.totalPostsTracked}`,
    '',
    '🏆 Best Category:',
    `   ${insights.bestCategory} — avg engagement: ${insights.categoryRanking[0]?.avgEngagement || 'N/A'}`,
    '',
    '📉 Worst Category:',
    `   ${insights.worstCategory} — avg engagement: ${insights.categoryRanking[insights.categoryRanking.length - 1]?.avgEngagement || 'N/A'}`,
    '',
    '⏰ Best Posting Hour:',
    `   ${insights.bestHour}:00 UTC (${insights.timeRanking[0]?.avgEngagement || 'N/A'} engagement)`,
    '',
    '📅 Best Day:',
    `   ${insights.bestDay} (${insights.dayRanking[0]?.avgEngagement || 'N/A'} engagement)`,
    '',
    '📋 Full Category Ranking:',
    ...insights.categoryRanking.map((r, i) =>
      `   ${i + 1}. ${r.category}: ${r.avgEngagement}`
    ),
  ];

  return lines.join('\n');
}

// ════════════════════════════════════════════════════
// RECOMMEND NEXT POST CATEGORY
// Based on what performs best + what was posted recently
// ════════════════════════════════════════════════════
export function recommendNextCategory(): string {
  const insights = getContentInsights();

  if (insights.totalPostsTracked < 3) {
    // Not enough data, rotate through all categories
    const all = ['signal', 'waiting', 'market_context', 'question', 'relatable', 'meme', 'educational', 'eod_recap'];
    const recentPosts = contentDb.prepare(`
      SELECT category FROM content_posts
      ORDER BY posted_at DESC LIMIT 5
    `).all() as any[];

    // Pick a category not posted recently
    for (const cat of all) {
      if (!recentPosts.some(p => p.category === cat)) {
        return cat;
      }
    }
    return all[Math.floor(Math.random() * all.length)];
  }

  // With data: recommend best performing category
  // But avoid posting same category twice in a row
  const lastCategory = contentDb.prepare(`
    SELECT category FROM content_posts
    WHERE posted_to_x = 1
    ORDER BY posted_at DESC LIMIT 1
  `).get() as any;

  if (lastCategory && lastCategory.category === insights.bestCategory) {
    // Last post was already best category, try second best
    return insights.categoryRanking.length > 1
      ? insights.categoryRanking[1]?.category || 'question'
      : 'question';
  }

  return insights.bestCategory;
}

// ════════════════════════════════════════════════════
// GET STATS FOR SPECIFIC CATEGORY
// ════════════════════════════════════════════════════
export function getCategoryStats(category: string): CategoryStats | null {
  const row = contentDb.prepare('SELECT * FROM category_stats WHERE category = ?')
    .get(category) as any;

  if (!row) return null;

  return {
    category: row.category,
    totalPosts: row.total_posts,
    totalLikes: row.total_likes,
    totalRetweets: row.total_retweets,
    totalReplies: row.total_replies,
    totalBookmarks: row.total_bookmarks,
    totalImpressions: row.total_impressions,
    avgEngagement: row.avg_engagement,
    bestEngagement: row.best_engagement,
    worstEngagement: row.worst_engagement,
  };
}
