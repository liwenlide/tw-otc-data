// Saves the official TPEx (上櫃) end-of-day datasets for one date, for apps whose hosting cannot reach tpex.org.tw.
// Usage: node scripts/snapshot.mjs [YYYY-MM-DD]   (default: today in Asia/Taipei)
// Bodies keep the official JSON shape; dailyQuotes rows are trimmed to ordinary 4-digit stock codes.
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const taipeiToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const date = process.argv[2] || taipeiToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date ${date}`);
const slash = date.replace(/-/g, '%2F');
const compact = date.replace(/-/g, '');

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

const quotes = await getJson(`https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${slash}&type=EW&response=json`);
if (!quotes || echoedDate(quotes) !== compact) {
  console.log(`No completed TPEx session for ${date} (echoed ${echoedDate(quotes)}); nothing saved.`);
  process.exit(0);
}
const trimmed = trimTables(quotes);
const rows = trimmed.tables.reduce((n, t) => n + (Array.isArray(t.data) ? t.data.length : 0), 0);
if (rows < 300) { console.log(`Only ${rows} ordinary rows for ${date}; looks incomplete, nothing saved.`); process.exit(0); }

const save = async (dir, body) => { await mkdir(`tpex/${dir}`, { recursive: true }); await writeFile(`tpex/${dir}/${date}.json`, JSON.stringify(body)); };
await save('dailyQuotes', trimmed);

// Supplemental datasets: saved only when they answer for the same date.
const extras = {
  valuation: `https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=${slash}&response=json`,
  flows: `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=${slash}&response=json`,
  margin: `https://www.tpex.org.tw/www/zh-tw/margin/balance?date=${slash}&response=json`,
};
const saved = { dailyQuotes: rows };
for (const [dir, url] of Object.entries(extras)) {
  const b = await getJson(url);
  if (b && echoedDate(b) === compact) { await save(dir, b); saved[dir] = true; } else saved[dir] = false;
}
const revenue = await getJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O');
if (Array.isArray(revenue) && revenue.length > 100) { await mkdir('tpex', { recursive: true }); await writeFile('tpex/revenue-latest.json', JSON.stringify(revenue)); saved.revenue = revenue.length; }

let latest = {};
try { latest = JSON.parse(await readFile('tpex/latest.json', 'utf8')); } catch { /* first run */ }
if (!latest.date || date >= latest.date) await writeFile('tpex/latest.json', JSON.stringify({ date, savedAt: new Date().toISOString(), saved }, null, 2));
console.log(`Saved ${date}:`, saved);
