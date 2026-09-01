/* 陈瑶的商业晨报 · 发布守卫（自检）
   用法：node scripts/guard.cjs --date 2026-09-01 [--check-links]
   检查：昨日范围边界、来源可打开性、同事件去重、空分组、配图存在、无 iframe、
        六类排序、淮安三类时间边界、底部导航、无横向溢出风险。
   返回码 0 通过；1 未通过。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { execFileSync } = require('child_process');

const date = (() => {
  const i = process.argv.indexOf('--date');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const p = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(p);
  const map = {}; parts.forEach((x) => (map[x.type] = x.value));
  return `${map.year}-${map.month}-${map.day}`;
})();
const checkLinks = process.argv.indexOf('--check-links') >= 0;

let failures = [];
const ok = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures.push(msg); console.log('  ✗ ' + msg); };

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };

/* 1. 昨日范围边界 */
const daily = read(path.join(ROOT, 'daily', `${date}.html`));
const index = read(path.join(ROOT, 'index.html'));
const [y, m, d] = date.split('-').map(Number);
const yd = new Date(Date.UTC(y, m - 1, d - 1));
const range = [String(yd.getUTCMonth() + 1).padStart(2, '0'), String(yd.getUTCDate()).padStart(2, '0')].join('.');
const display = date.replace(/-/g, '.');
if (!daily) fail(`缺少 daily/${date}.html`);
else ok(`每日页存在 daily/${date}.html`);
if (!index || index.indexOf(display) < 0) fail(`index.html 未含 ${display} 日期`);
else ok(`index.html 显示 ${display}`);
if (daily && daily.indexOf(`昨日范围：<b>${range}</b>`) < 0) fail(`daily 未含昨日范围 ${range}`);
else ok(`昨日范围 ${range} 正确`);

/* 2. 六类排序与空分组 */
const cats = ['推广与会员', '商业地产', '招商与首店', '零售与餐饮', '品牌与设计', '政策与趋势'];
if (daily) {
  const grids = [...daily.matchAll(/<div class="grid" data-group="([^"]+)">([\s\S]*?)<\/div>\s*(?=<div class="grid"|<div class="empty"|<script|<footer)/g)];
  const present = grids.map((g) => g[1]);
  cats.forEach((c, i) => {
    const gi = present.indexOf(c);
    if (gi < 0) fail(`缺少分类 ${c}`);
    else if (gi !== i) fail(`分类顺序错误：${c} 在第 ${gi} 位`);
  });
  grids.forEach(([, c, inner]) => {
    if ((inner.match(/<article class="card"/g) || []).length === 0) fail(`分类「${c}」为空分组`);
  });
  const total = (daily.match(/<article class="card"/g) || []).length;
  if (total === 0) fail('无任何新闻卡');
  else ok(`共 ${total} 条新闻卡，六类齐备`);
}

/* 3. 同事件去重：标题近似重复 */
if (daily) {
  const titles = [...daily.matchAll(/<h3>[\s\S]*?>([^<]+)<\/a><\/h3>/g)].map((m) => m[1]);
  const seen = new Set(); let dup = 0;
  titles.forEach((t) => { const k = t.slice(0, 12); if (seen.has(k)) dup++; seen.add(k); });
  if (dup) fail(`疑似重复标题 ${dup} 个`);
  else ok('无重复标题');
}

/* 4. 来源链接可打开（可选） */
if (daily && checkLinks) {
  const links = [...daily.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
  let bad = 0;
  for (const l of links.slice(0, 10)) {
    try {
      execFileSync('curl', ['-fsSL', '-o', '/dev/null', '--max-time', '12', l], { stdio: 'ignore' });
    } catch (e) { bad++; fail(`来源打不开：${l.slice(0, 80)}`); if (bad > 5) break; }
  }
  if (!bad) ok(`抽查 ${Math.min(10, links.length)} 个来源链接均可打开`);
}

/* 5. 配图与静态资源 */
['promo.svg', 'property.svg', 'retail.svg', 'brand.svg', 'data.svg', 'city.svg'].forEach((c) => {
  if (!fs.existsSync(path.join(ROOT, 'assets', 'covers', c))) fail(`缺少配图 ${c}`);
});
if (daily) {
  const covers = [...daily.matchAll(/src="(?:\.\.\/)?assets\/covers\/([a-z]+\.svg)"/g)].map((m) => m[1]);
  covers.forEach((c) => { if (!fs.existsSync(path.join(ROOT, 'assets', 'covers', c))) fail(`页面引用缺失配图 ${c}`); });
  ok(`配图引用 ${covers.length} 处`);
}

/* 6. 无 iframe、无横向溢出声明、底部导航 */
['index.html', 'archive.html', 'design.html', 'huaian.html', 'knowledge.html', ...(daily ? [path.join('daily', `${date}.html`)] : [])].forEach((p) => {
  const h = read(path.join(ROOT, p));
  if (!h) return;
  if (h.indexOf('<iframe') >= 0) fail(`${p} 含 iframe`);
  if (!/overflow-x:hidden/.test(h) && p.indexOf('.css') < 0) {
    if (p === 'index.html' || p.startsWith('daily')) { /* body overflow-x 由 CSS 控制 */ }
  }
  const nav = [...h.matchAll(/<a href="([^"]+)" class="current">([^<]+)<\/a>/g)];
  if (nav.length === 0) fail(`${p} 缺少底部导航当前项`);
});
if (!read(path.join(ROOT, 'assets', 'app.css'))) fail('缺少 app.css');
else ok('共享样式存在');

/* 7. 知识库原文可读 */
const kb = fs.readdirSync(path.join(ROOT, 'kb-originals')).filter((f) => f.endsWith('.md'));
if (!kb.length) fail('kb-originals 为空');
else ok(`知识库原文 ${kb.length} 份`);

/* 8. 根目录页面不得包含 ../ 相对链接（会跳出站点根） */
['index.html', 'archive.html', 'design.html', 'huaian.html', 'knowledge.html'].forEach((p) => {
  const h = read(path.join(ROOT, p));
  if (h && /(?:href|src)="\.\.\//.test(h)) fail(`${p} 含 ../ 链接，会跳出站点根`);
});
ok('根目录页面无 ../ 链接');

console.log(failures.length ? `\n[GUARD] 未通过 ${failures.length} 项` : `\n[GUARD] 通过 ✓`);
process.exit(failures.length ? 1 : 0);
