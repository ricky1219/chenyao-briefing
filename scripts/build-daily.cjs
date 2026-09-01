/* 陈瑶的商业晨报 · 每日构建脚本
   用法：node scripts/build-daily.cjs --date 2026-09-02 [--day-file data/2026-09-02.json]
   day-file 结构：
   { date, range, heroText?, observe[], groups:[["分类",[["09.01","来源","标题","摘要","可借鉴","关键词","链接","图片"]]]], stats? }
   产物：daily/YYYY-MM-DD.html、index.html（最新）、data/index.json（日索引）
   可选：--huaian-file data/huaian.json → 重渲 huaian.html
         --design-file data/design.json → 重渲 design.html
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = require('./site-lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const { renderDailyPage, renderShell, designCard, huaianCard, writeFile, esc } = lib;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const date = arg('--date');
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('需提供 --date YYYY-MM-DD'); process.exit(1); }
const dayFile = arg('--day-file') || path.join(ROOT, 'data', `${date}.json`);
if (!fs.existsSync(dayFile)) { console.error(`未找到数据文件：${dayFile}`); process.exit(1); }

const data = JSON.parse(fs.readFileSync(dayFile, 'utf8'));
const display = date.replace(/-/g, '.');
const [y, m, d] = date.split('-').map(Number);
const range = data.range || (() => {
  const yd = new Date(Date.UTC(y, m - 1, d - 1));
  return [String(yd.getUTCMonth() + 1).padStart(2, '0'), String(yd.getUTCDate()).padStart(2, '0')].join('.');
})();
const stats = Object.assign({}, data.stats);
stats.total = data.groups.reduce((s, [, its]) => s + (its || []).length, 0);

const page = renderDailyPage({
  date, range, displayDate: display,
  heroTitle: data.heroTitle || `${m}月${d}日 · 昨日商业晨报`,
  heroText: data.heroText || `仅收录 ${range} 发布、可公开核验的独立报道`,
  observe: data.observe && data.observe.length ? data.observe : ['暂无观察。'],
  groups: data.groups,
  stats,
  prefix: '../',
});
writeFile(path.join(ROOT, 'daily', `${date}.html`), page);

/* 首页 = 最新日报 */
const indexPage = page.split('"../').join('"');
writeFile(path.join(ROOT, 'index.html'), indexPage);

/* 日索引 */
const indexFile = path.join(ROOT, 'data', 'index.json');
const idx = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { days: [] };
const prev = idx.days.find((x) => x.date === date);
const hero = data.heroTitle || `${m}月${d}日 · 昨日商业晨报`;
if (prev) { prev.count = stats.total; prev.hero = hero; }
else idx.days.push({ date, count: stats.total, hero });
idx.days.sort((a, b) => a.date.localeCompare(b.date));
idx.latest = date;
writeFile(indexFile, JSON.stringify(idx, null, 2));

/* 可选：淮安页 */
const huaianFile = arg('--huaian-file');
if (huaianFile && fs.existsSync(huaianFile)) {
  const hj = JSON.parse(fs.readFileSync(huaianFile, 'utf8'));
  const labels = ['本地最新', '商业资料库', '其他大事'];
  const labeled = labels.map((l) => [l, (hj.groups.find((g) => g[0] === l) || [l, []])[1]]);
  const body = `<main class="wrap">
  <p class="eyebrow">CHEN YAO · HUAI'AN LOCAL</p>
  <h1 class="display">淮安本地 <span class="accent">商业脉搏</span></h1>
  <p class="lede">本地最新仅收录昨天或近 7 日内可核验更新；更早政策与资料归入商业资料库。</p>
  <div class="statline">本地最新 <b>${labeled[0][1].length}</b> · 商业资料库 <b>${labeled[1][1].length}</b> · 其他大事 <b>${labeled[2][1].length}</b></div>
  <div class="hua-filters" data-filterbar><button data-f="all" class="active">全部</button>${labels.map((l) => `<button data-f="${esc(l)}">${esc(l)}</button>`).join('')}</div>
  <p class="filter-note" data-filter-note></p>
  ${labeled.map(([label, its]) => `<div class="grid" data-group="${esc(label)}">${its.map((it) => huaianCard(it, label, '')).join('')}</div>`).join('\n')}
  <div class="empty">该分类暂无内容。</div>
  </main>`;
  writeFile(path.join(ROOT, 'huaian.html'), renderShell({ current: 'huaian', title: '陈瑶的商业晨报｜淮安本地最新', body }));
}

/* 可选：设计页 */
const designFile = arg('--design-file');
if (designFile && fs.existsSync(designFile)) {
  const dj = JSON.parse(fs.readFileSync(designFile, 'utf8'));
  const cats = ['推广活动', '品牌与IP', '包装与零售', '视觉资产'];
  const groups = cats.map((c) => [c, (dj.cases || []).filter((it) => it[0] === c)]);
  const past = dj.pastCases || [];
  const body = `<main class="wrap">
  <p class="eyebrow">CHEN YAO · DESIGN INSPIRATION</p>
  <h1 class="display">好设计案例</h1>
  <p class="lede">站酷公开商业设计作品 · 仅收录可公开打开、与商业直接相关的案例</p>
  <div class="filters" data-filterbar><button data-f="all" class="active">全部</button>${cats.map((c) => `<button data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <p class="filter-note" data-filter-note></p>
  ${groups.map(([c, its]) => `<div class="grid" data-group="${esc(c)}">${its.map((it) => designCard(it, '')).join('')}</div>`).join('\n')}
  <h2 class="section-title">往期归档 <small>按月折叠 · 共 ${past.length} 个</small></h2>
  <details class="kb"><summary>往期案例（默认折叠）</summary><div class="grid">${past.map((it) => designCard(it, '')).join('')}</div></details>
  <div class="empty">当前分类暂无案例。</div>
  </main>`;
  writeFile(path.join(ROOT, 'design.html'), renderShell({ current: 'design', title: '陈瑶的商业晨报｜好设计案例', body }));
}

console.log(JSON.stringify({ date, published: stats.total, groups: data.groups.map(([c, its]) => [c, its.length]), stats, huaian: huaianFile ? 'updated' : 'skip', design: designFile ? 'updated' : 'skip' }));
