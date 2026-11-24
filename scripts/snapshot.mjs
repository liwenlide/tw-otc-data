// Saves the official TPEx (上櫃) end-of-day datasets for one date, for apps whose hosting cannot reach tpex.org.tw.
// Usage: node scripts/snapshot.mjs [YYYY-MM-DD]   (default: every missing weekday in the last 7 days)
// Bodies keep the official JSON shape; dailyQuotes rows are trimmed to ordinary 4-digit stock codes.
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
// Scheduled runs can start hours late (seen: 07:30Z → 19:01Z), so every run backfills the recent
// weekdays that are still missing instead of trusting "today".
const taipeiNow = () => new Date(Date.now() + 8 * 3600_000);
const ymd = (d) => d.toISOString().slice(0, 10);
const LOOKBACK_DAYS = 7;
function candidateDates(arg) {
  if (arg) { if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error(`bad date ${arg}`); return [arg]; }
  const now = taipeiNow();
  const afterClose = now.getUTCHours() * 60 + now.getUTCMinutes() >= 14 * 60 + 40;
  const out = [];
  for (let i = afterClose ? 0 : 1; i <= LOOKBACK_DAYS; i++) {
    const d = new Date(now.getTime() - i * 86400_000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(ymd(d));
  }
  return out;
}

async function getJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'zh-TW,zh;q=0.9' }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(await res.text());
    } catch (e) {
      console.warn(`${url} attempt ${attempt}: ${e.message}`);
      if (attempt === 3) return null;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

const echoedDate = (b) => (/^\d{8}$/.test(String(b?.date)) ? String(b.date) : null);
const ordinary = (code) => /^[1-9]\d{3}$/.test(String(code ?? '').trim());
const trimTables = (b) => ({ ...b, tables: (b.tables ?? []).map((t) => ({ ...t, data: Array.isArray(t.data) ? t.data.filter((r) => Array.isArray(r) && ordinary(r[0])) : t.data })) });
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const save = async (dir, date, body) => { await mkdir(`tpex/${dir}`, { recursive: true }); await writeFile(`tpex/${dir}/${date}.json`, JSON.stringify(body)); };

async function snapshotDate(date) {
  const slash = date.replace(/-/g, '%2F');
  const compact = date.replace(/-/g, '');
  const saved = {};
  if (!(await exists(`tpex/dailyQuotes/${date}.json`))) {
    const quotes = await getJson(`https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${slash}&type=EW&response=json`);
    if (!quotes || echoedDate(quotes) !== compact) { console.log(`${date}: no completed TPEx session (echoed ${echoedDate(quotes)}).`); return null; }
    const trimmed = trimTables(quotes);
    const rows = trimmed.tables.reduce((n, t) => n + (Array.isArray(t.data) ? t.data.length : 0), 0);
    if (rows < 300) { console.log(`${date}: only ${rows} ordinary rows; looks incomplete, not saved.`); return null; }
    await save('dailyQuotes', date, trimmed);
    saved.dailyQuotes = rows;
  }
  // Supplemental datasets publish later (法人 ~16:30, 融資 ~21:30 Taipei): retried each run until present.
  const extras = {
    valuation: `https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=${slash}&response=json`,
    flows: `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=${slash}&response=json`,
    margin: `https://www.tpex.org.tw/www/zh-tw/margin/balance?date=${slash}&response=json`,
  };
  for (const [dir, url] of Object.entries(extras)) {
    if (await exists(`tpex/${dir}/${date}.json`)) continue;
    const b = await getJson(url);
    const rows = (b?.tables ?? []).reduce((n, t) => n + (Array.isArray(t.data) ? t.data.length : 0), 0);
    if (b && echoedDate(b) === compact && rows > 0) { await save(dir, date, b); saved[dir] = rows; }
  }
  return saved;
}

const arg = process.argv[2];
const results = {};
for (const date of candidateDates(arg)) {
  const r = await snapshotDate(date);
  if (r && Object.keys(r).length) results[date] = r;
}
const revenue = await getJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O');
if (Array.isArray(revenue) && revenue.length > 100) { await mkdir('tpex', { recursive: true }); await writeFile('tpex/revenue-latest.json', JSON.stringify(revenue)); }

const dates = (await readdir('tpex/dailyQuotes').catch(() => [])).map((f) => f.replace(/\.json$/, '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
const latest = dates.at(-1) ?? null;
if (latest) await writeFile('tpex/latest.json', JSON.stringify({ date: latest, savedAt: new Date().toISOString() }, null, 2));
console.log('Saved this run:', JSON.stringify(results), 'latest:', latest);
