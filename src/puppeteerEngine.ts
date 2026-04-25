// ════════════════════════════════════════════════════
// APEX BOT v7.0 — X ENGINE (agent-twitter-client)
// NO Puppeteer. NO Chrome. ~50MB RAM.
// Same exports as old Puppeteer engine — zero changes
// needed in contentScheduler.ts, engagementBot.ts, etc.
// ════════════════════════════════════════════════════

import { Scraper } from 'agent-twitter-client';
import fs from 'fs';
import path from 'path';
import { config } from './config';

const COOKIES_PATH = path.resolve('./data/x_cookies.json');
const RAW_COOKIES_PATH = path.resolve('./data/x_cookies_raw.txt');

if (!fs.existsSync(path.dirname(COOKIES_PATH))) {
  fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
}

let scraper: Scraper | null = null;
let isReady = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const jitter = (min: number, max: number) =>
  sleep(Math.floor(Math.random() * (max - min + 1)) + min);

// ── Cookie Parsing ──────────────────────────────────
function parseCookies(input: string): any[] {
  const trimmed = input.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      // Cookie-Editor format: { ".x.com": { "name": "value" } }
      const out: any[] = [];
      for (const [domain, obj] of Object.entries(parsed)) {
        for (const [name, value] of Object.entries(obj as Record<string, string>)) {
          out.push({
            name, value: String(value),
            domain: domain.startsWith('.') ? domain : '.' + domain,
            path: '/', secure: true,
            httpOnly: name.startsWith('__Secure') || name.startsWith('__Host'),
            sameSite: 'None',
          });
        }
      }
      return out;
    } catch { /* not JSON */ }
  }
  // name=value; name2=value2 format
  const out: any[] = [];
  for (const pair of trimmed.split(';').map(s => s.trim()).filter(Boolean)) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    out.push({ name: pair.substring(0, eq).trim(), value: pair.substring(eq + 1).trim(), domain: '.x.com', path: '/' });
  }
  return out;
}

// ── Auth ────────────────────────────────────────────
async function ensureAuth(): Promise<boolean> {
  if (isReady && scraper) {
    try { if (await scraper.isLoggedIn()) return true; } catch { /* stale */ }
    isReady = false;
  }

  scraper = new Scraper();

  // Source 1: GitHub Actions env var (base64 encoded)
  if (process.env.X_COOKIES) {
    try {
      const decoded = Buffer.from(process.env.X_COOKIES, 'base64').toString('utf-8');
      const cookies = parseCookies(decoded);
      if (cookies.length) {
        await scraper.setCookies(cookies);
        if (await scraper.isLoggedIn()) { isReady = true; return true; }
      }
    } catch { /* bad env var */ }
  }

  // Source 2: JSON cookie file
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await scraper.setCookies(cookies);
      if (await scraper.isLoggedIn()) { isReady = true; return true; }
    } catch { /* bad file */ }
  }

  // Source 3: Raw cookie string file
  if (fs.existsSync(RAW_COOKIES_PATH)) {
    try {
      const cookies = parseCookies(fs.readFileSync(RAW_COOKIES_PATH, 'utf-8'));
      if (cookies.length) {
        await scraper.setCookies(cookies);
        if (await scraper.isLoggedIn()) {
          fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
          isReady = true;
          return true;
        }
      }
    } catch { /* bad raw */ }
  }

  // Source 4: Direct credential login (last resort, detection risk)
  try {
    await scraper.login(config.x.username, config.x.password, config.x.email);
    await sleep(3000);
    if (await scraper.isLoggedIn()) {
      const cookies = await scraper.getCookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
      isReady = true;
      return true;
    }
  } catch { /* login blocked */ }

  console.log('   🚨 X AUTH FAILED — need fresh cookies');
  return false;
}

// ════════════════════════════════════════════════════
// PUBLIC API (same names as old Puppeteer engine)
// ════════════════════════════════════════════════════

export async function launchBrowser(): Promise<any> {
  console.log('   🚀 Engine ready (no browser)');
  return {};
}

export async function loginToX(): Promise<boolean> {
  return ensureAuth();
}

export async function postTweet(text: string): Promise<string | null> {
  if (!isReady && !(await ensureAuth())) return null;
  try {
    const result = await scraper!.sendTweet(text);
    const id = (result as any)?.id;
    if (id) {
      const url = `https://x.com/${config.x.username}/status/${id}`;
      console.log('   ✅ Posted:', url);
      return url;
    }
    return null;
  } catch (e) {
    console.error('   ❌ Post error:', (e as Error).message);
    return null;
  }
}

export async function engageWithTweet(
  tweetUrl: string,
  actions: { like?: boolean; retweet?: boolean; reply?: string; quote?: string }
): Promise<{ liked: boolean; retweeted: boolean; replied: boolean; quoted: boolean }> {
  const r = { liked: false, retweeted: false, replied: false, quoted: false };
  if (!isReady && !(await ensureAuth())) return r;

  const tweetId = tweetUrl.split('/status/')[1]?.split('?')[0];
  if (!tweetId) return r;

  try {
    if (actions.like) { try { await scraper!.likeTweet(tweetId); r.liked = true; console.log('   ❤️ Liked'); } catch { /* */ } await jitter(800, 1500); }
    if (actions.retweet) { try { await scraper!.retweet(tweetId); r.retweeted = true; console.log('   🔁 Retweeted'); } catch { /* */ } await jitter(800, 1500); }
    if (actions.reply) { try { await scraper!.sendTweet(actions.reply, tweetId); r.replied = true; console.log('   💬 Replied'); } catch { /* */ } await jitter(1000, 2000); }
    if (actions.quote) { try { await scraper!.sendTweet(`${actions.quote}\n\n${tweetUrl}`); r.quoted = true; console.log('   📝 Quoted'); } catch { /* */ } await jitter(1000, 2000); }
  } catch (e) {
    console.error('   ❌ Engage error:', (e as Error).message);
  }
  return r;
}

export async function getLatestTweets(handle: string, limit = 5): Promise<Array<{
  postId: string; postUrl: string; postText: string; timeAgo: string;
}>> {
  if (!isReady && !(await ensureAuth())) return [];
  const out: Array<{ postId: string; postUrl: string; postText: string; timeAgo: string }> = [];
  try {
    for await (const t of scraper!.getTweets(handle, limit)) {
      if (!t) continue;
      const id = t.id || '';
      out.push({ postId: id, postUrl: `https://x.com/${handle}/status/${id}`, postText: t.text || '', timeAgo: t.created_at || '' });
      if (out.length >= limit) break;
    }
  } catch (e) {
    console.error('   ❌ Fetch error:', (e as Error).message);
  }
  return out;
}

export async function closeBrowser(): Promise<void> {
  if (scraper) {
    try { const c = await scraper.getCookies(); fs.writeFileSync(COOKIES_PATH, JSON.stringify(c, null, 2)); } catch { /* */ }
  }
  scraper = null;
  isReady = false;
}

// ════════════════════════════════════════════════════
// CLI TOOLS
// ════════════════════════════════════════════════════

async function cliSaveCookies(): Promise<void> {
  console.log('\n🍪 Paste cookies below, then press Ctrl+D\n');
  let buf = '';
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  await new Promise<void>(res => {
    process.stdin.on('data', (c: string) => { buf += c; });
    process.stdin.on('end', () => {
      const cookies = parseCookies(buf);
      if (!cookies.length) { console.log('❌ No valid cookies'); res(); return; }
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
      console.log(`✅ Saved ${cookies.length} cookies`);
      res();
    });
  });
  process.exit(0);
}

async function cliTest(): Promise<void> {
  console.log('\n🧪 ENGINE TEST\n');
  if (!(await ensureAuth())) { console.log('❌ AUTH FAILED'); process.exit(1); }
  try { const me = await scraper!.me(); console.log('   @' + me?.username, '|', me?.name, '|', me?.followersCount, 'followers'); } catch { /* */ }
  const tweets = await getLatestTweets(config.x.username, 3);
  for (const t of tweets) console.log(`   [${t.postId.slice(-8)}] ${t.postText.slice(0, 60)}`);
  console.log('\n✅ ENGINE READY\n');
  await closeBrowser();
  process.exit(0);
}

if (process.argv.includes('save-cookies')) cliSaveCookies().catch(() => process.exit(1));
if (process.argv.includes('test')) cliTest().catch(() => process.exit(1));
