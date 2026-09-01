/* 陈瑶的商业晨报 · 旧站一次性迁移脚本
   从旧站（商业资讯日报/*.html 内嵌结构化数据）迁移到新站苹果简洁风。
   用法：node scripts/migrate.cjs <旧站目录> */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = require('./site-lib.cjs');

const OLD = process.argv[2];
if (!OLD) { console.error('用法：node scripts/migrate.cjs <旧站目录>'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..');
const { esc, renderShell, dailyCard, designCard, huaianCard, renderDailyPage, writeFile } = lib;

/* ---------- 通用提取 ---------- */
function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

/* 括号配平提取 JS 数组（支持双引号 JSON 与单引号 JS 数组） */
function extractArray(html, name) {
  const marker = `const ${name}=`;
  const s = html.indexOf(marker);
  if (s < 0) return null;
  const src = html.slice(s + marker.length);
  let i = 0;
  function skipWs() { while (i < src.length && /\s/.test(src[i])) i++; }
  function parseValue() {
    skipWs(); const c = src[i];
    if (c === '[') return parseArray();
    if (c === "'" || c === '"') return parseString();
    const m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (m) { i += m[0].length; return Number(m[0]); }
    if (src.startsWith('true', i)) { i += 4; return true; }
    if (src.startsWith('false', i)) { i += 5; return false; }
    if (src.startsWith('null', i)) { i += 4; return null; }
    return undefined;
  }
  function parseString() {
    const quote = src[i++]; let out = ''; let escFlag = false;
    while (i < src.length) {
      const c = src[i++];
      if (escFlag) { out += c; escFlag = false; }
      else if (c === '\\') escFlag = true;
      else if (c === quote) break;
      else out += c;
    }
    return out;
  }
  function parseArray() {
    i++; const arr = []; skipWs();
    if (src[i] === ']') { i++; return arr; }
    while (i < src.length) {
      const v = parseValue();
      if (v === undefined) break;
      arr.push(v); skipWs();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') { i++; break; }
      break;
    }
    return arr;
  }
  const val = parseValue();
  return val === undefined ? null : val;
}

function extractDailyGroups(html) {
  return extractArray(html, 'groups');
}
function extractObserve(html) {
  const m = html.match(/<section class="observe">([\s\S]*?)<\/section>/);
  if (!m) return [];
  return [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => stripTags(x[1])).filter(Boolean);
}
function extractHero(html) {
  const m = html.match(/<section class="hero">([\s\S]*?)<\/section>/);
  if (!m) return '';
  const strong = m[1].match(/<strong>([\s\S]*?)<\/strong>/);
  return stripTags(strong ? strong[1] : m[1]);
}

/* ---------- 早期刊卡解析（07-28 / 07-29 无 groups 数据） ---------- */
function classify(text) {
  const t = String(text || '');
  if (/首店|入驻|招商|开业·品牌|新店/.test(t)) return '招商与首店';
  if (/餐饮|咖啡|茶饮|零售|商超|超市|消费品牌|连锁|门店/.test(t)) return '零售与餐饮';
  if (/营销|活动|会员|代言|IP|联名|促销|企划/.test(t)) return '推广与会员';
  if (/设计|包装|视觉|品牌形象|VI/.test(t)) return '品牌与设计';
  if (/政策|数据|报告|趋势|消费券|统计|白皮书/.test(t)) return '政策与趋势';
  return '商业地产';
}
function parseArticleCards(html) {
  const cards = [...html.matchAll(/<article[^>]*class="card"([\s\S]*?)<\/article>/g)].map((m) => m[1]);
  return cards.map((card) => {
    const h = card.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);
    const title = h ? stripTags(h[1]) : '';
    const level = (card.match(/<span class="level">([\s\S]*?)<\/span>/) || [])[1] || (card.match(/<small>([\s\S]*?)<\/small>/) || [])[1] || '';
    const date = (card.match(/<span>(\d{2}\.\d{2})<\/span>/) || [])[1] || '';
    const link = (card.match(/href="(https?:[^"]+)"/) || [])[1] || '';
    const ps = [...card.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => stripTags(x[1])).filter(Boolean);
    const summary = ps[0] || '';
    /* 统一为 [date, source, title, summary, takeaway, keywords, link, image] */
    return [date, '', title, summary, '', '', link, ''];
  }).filter((x) => x[2]);
}

/* ---------- 迁移每日页 ---------- */
const oldFiles = fs.readdirSync(OLD).filter((f) => /^2026-\d{2}-\d{2}\.html$/.test(f)).sort();
const latestDate = oldFiles.length ? oldFiles[oldFiles.length - 1].slice(0, 10) : '';
const dayMeta = []; // {date, display, range, title, count, hero, observe}
const dailyPages = [];
const CATS = ['推广与会员', '商业地产', '招商与首店', '零售与餐饮', '品牌与设计', '政策与趋势'];

function groupOf(items) {
  return CATS.map((c) => [c, items.filter((it) => it[0] === c || it[0] === '')]);
}

for (const f of oldFiles) {
  const date = f.slice(0, 10);
  const display = date.replace(/-/g, '.');
  const [y, m, d] = date.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
  const range = [String(yesterday.getUTCFullYear()), String(yesterday.getUTCMonth() + 1).padStart(2, '0'), String(yesterday.getUTCDate()).padStart(2, '0')].join('.').slice(5);
  const html = fs.readFileSync(path.join(OLD, f), 'utf8');
  const extracted = extractDailyGroups(html);
  let observe = extractObserve(html);
  const hero = extractHero(html);
  let groups = extracted;
  let withCat = []; // [category, item]
  if (groups) {
    withCat = groups.flatMap(([c, its]) => (its || []).map((it) => [c, it]));
  } else {
    observe = observe.length ? observe : ['早期刊载于旧站，已按可核验信息迁移归档。'];
    const parsed = parseArticleCards(html);
    withCat = parsed.map((it) => [classify(`${it[1]}${it[2]}${it[3]}`), it]);
    groups = CATS.map((c) => [c, withCat.filter(([cat]) => cat === c).map(([, it]) => it)]);
  }
  const page = renderDailyPage({
    date, range, displayDate: display,
    heroTitle: `${m}月${d}日 · 昨日商业晨报`,
    heroText: `仅收录 ${range} 发布、可公开核验的独立报道${hero ? `；${hero}` : ''}`,
    observe: observe.length ? observe : ['暂无观察。'],
    groups,
    stats: { total: withCat.length },
    prefix: '../',
    nav: date === latestDate ? 'index' : 'archive',
  });
  const outPath = path.join(ROOT, 'daily', `${date}.html`);
  writeFile(outPath, page);
  dayMeta.push({ date, display, range, count: withCat.length, hero, observe });
  dailyPages.push(page);
  console.log(`daily ${date}: ${withCat.length} 条（${extracted ? '结构化' : '卡片解析'}）`);
}

/* 最新一日 = 日期最大 */
dayMeta.sort((a, b) => a.date.localeCompare(b.date));
const latest = dayMeta[dayMeta.length - 1];
if (!latest) { console.error('未发现任何日报'); process.exit(1); }

/* ---------- 迁移设计页 ---------- */
const oldDesign = fs.readFileSync(path.join(OLD, 'design.html'), 'utf8');
const cases = extractArray(oldDesign, 'cases') || [];
const pastCases = extractArray(oldDesign, 'pastCases') || [];
const designCats = ['推广活动', '品牌与IP', '包装与零售', '视觉资产'];
const designGroups = designCats.map((c) => [c, cases.filter((it) => it[0] === c)]);
const designObserve = [
  '商业设计案例以公开可打开的站酷作品为来源，仅作灵感参考，不构成品牌经营事实。',
  '新站每日最多展示 15 个优质案例，往期按月份折叠归档。',
];
function designBody(prefix) {
  return `<main class="wrap">
  <p class="eyebrow">CHEN YAO · DESIGN INSPIRATION</p>
  <h1 class="display">好设计案例</h1>
  <p class="lede">站酷公开商业设计作品 · 仅收录可公开打开、与商业直接相关的案例</p>
  <section class="observe"><h2>设计观察</h2><ol>${designObserve.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>
  <div class="filters" data-filterbar><button data-f="all" class="active">全部</button>${designCats.map((c) => `<button data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <p class="filter-note" data-filter-note></p>
  <div class="grid" data-group="推广活动">${designGroups[0][1].map((it) => designCard(it, prefix)).join('')}</div>
  <div class="grid" data-group="品牌与IP">${designGroups[1][1].map((it) => designCard(it, prefix)).join('')}</div>
  <div class="grid" data-group="包装与零售">${designGroups[2][1].map((it) => designCard(it, prefix)).join('')}</div>
  <div class="grid" data-group="视觉资产">${designGroups[3][1].map((it) => designCard(it, prefix)).join('')}</div>
  <h2 class="section-title">往期归档 <small>按月折叠 · 共 ${pastCases.length} 个</small></h2>
  <details class="kb"><summary>往期案例（默认折叠）</summary><div class="grid">${pastCases.map((it) => designCard(it, prefix)).join('')}</div></details>
  <div class="empty">当前分类暂无案例。</div>
  </main>`;
}
writeFile(path.join(ROOT, 'design.html'), renderShell({ current: 'design', title: '陈瑶的商业晨报｜好设计案例', body: designBody('') }));

/* ---------- 迁移淮安页 ---------- */
const oldHuaian = fs.readFileSync(path.join(OLD, 'huaian.html'), 'utf8');
const huaianGroups = extractArray(oldHuaian, 'groups') || [];
const huaLabels = ['本地最新', '商业资料库', '其他大事'];
const huaLabeled = huaLabels.map((label) => [label, (huaianGroups.find((g) => g[0] === label) || [label, []])[1]]);
function huaianBody(prefix) {
  const count = huaLabeled.reduce((s, [, its]) => s + its.length, 0);
  return `<main class="wrap">
  <p class="eyebrow">CHEN YAO · HUAI'AN LOCAL</p>
  <h1 class="display">淮安本地 <span class="accent">商业脉搏</span></h1>
  <p class="lede">本地最新仅收录昨天或近 7 日内可核验更新；更早政策与资料归入商业资料库。</p>
  <div class="statline">本地最新 <b>${huaLabeled[0][1].length}</b> · 商业资料库 <b>${huaLabeled[1][1].length}</b> · 其他大事 <b>${huaLabeled[2][1].length}</b></div>
  <div class="hua-filters" data-filterbar><button data-f="all" class="active">全部</button>${huaLabels.map((l) => `<button data-f="${esc(l)}">${esc(l)}</button>`).join('')}</div>
  <p class="filter-note" data-filter-note></p>
  ${huaLabeled.map(([label, its]) => `<div class="grid" data-group="${esc(label)}">${its.map((it) => huaianCard(it, label, prefix)).join('')}</div>`).join('\n')}
  <div class="empty">该分类暂无内容。</div>
  </main>`;
}
writeFile(path.join(ROOT, 'huaian.html'), renderShell({ current: 'huaian', title: '陈瑶的商业晨报｜淮安本地最新', body: huaianBody('') }));

/* ---------- 迁移知识库原文 ---------- */
const kbSrc = path.join(OLD, 'kb-originals');
const kbFiles = fs.existsSync(kbSrc) ? fs.readdirSync(kbSrc).filter((f) => f.endsWith('.md')) : [];
for (const f of kbFiles) {
  fs.copyFileSync(path.join(kbSrc, f), path.join(ROOT, 'kb-originals', f));
}
/* 从旧 knowledge.html 提取 docs 显示标题映射 */
const oldKbHtml = fs.existsSync(path.join(OLD, 'knowledge.html')) ? fs.readFileSync(path.join(OLD, 'knowledge.html'), 'utf8') : '';
let docsMap = {};
const dm = oldKbHtml.match(/const docs=\{([\s\S]*?)\};/);
if (dm) {
  for (const m of dm[1].matchAll(/'([^']+)'\.md'?\s*:\s*'([^']+)'/g)) docsMap[`${m[1]}.md`] = m[2];
}
for (const f of kbFiles) if (!docsMap[f]) docsMap[f] = f.replace(/\.md$/, '');

/* 每个 kb 文件提取标题与首段摘要 */
function kbBrief(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'kb-originals', file), 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  const h1 = raw.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].trim() : (docsMap[file] || file);
  const p = raw.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('|') && !l.startsWith('>'));
  return { file, title, brief: p ? p.slice(0, 90) : '' };
}
const kbItems = kbFiles.map(kbBrief);
const kbPriority = kbItems.slice(0, 6);
const kbMore = kbItems.slice(6);

/* ---------- 归档页 ---------- */
function archiveBody(prefix) {
  const months = {};
  dayMeta.forEach((d) => {
    const key = d.date.slice(0, 7);
    (months[key] = months[key] || []).push(d);
  });
  const monthBlocks = Object.keys(months).sort().reverse().map((key) => {
    const label = `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`;
    const lis = months[key].sort((a, b) => b.date.localeCompare(a.date)).map((d) =>
      `<li><span class="d">${d.date.slice(5).replace('-', '.')}</span><a href="${prefix}daily/${d.date}.html"><span class="t">${esc(d.hero || `${d.date.slice(5).replace('-', '.')} 商业晨报`)}</span></a><span class="n">${d.count} 条</span></li>`).join('');
    return `<div class="month-block"><div class="month-head">${label}</div><ul class="month-list">${lis}</ul></div>`;
  }).join('');
  const priCards = kbPriority.map((k) =>
    `<article class="card"><div class="meta"><span class="chip alt">知识库原文</span></div><h3><a href="${prefix}knowledge.html?doc=${encodeURIComponent(k.file)}">${esc(k.title)}</a></h3>${k.brief ? `<p class="takeaway">${esc(k.brief)}</p>` : ''}<div class="foot"><a class="link" href="${prefix}knowledge.html?doc=${encodeURIComponent(k.file)}">阅读原文 ↗</a></div></article>`).join('');
  const moreLis = kbMore.map((k) =>
    `<li><span class="y">${esc(k.file.slice(0, 4))}</span><a class="kb-t" href="${prefix}knowledge.html?doc=${encodeURIComponent(k.file)}">${esc(k.title)}</a></li>`).join('');
  return `<main class="wrap">
  <p class="eyebrow">CHEN YAO · ARCHIVE</p>
  <h1 class="display">更早的晨报</h1>
  <p class="lede">全部日报按月归档；下方为知识库行业档案（全量可公开行业资料）。</p>
  <h2 class="section-title">历史日报 <small>共 ${dayMeta.length} 期</small></h2>
  ${monthBlocks}
  <h2 class="section-title">知识库行业档案 <small>全量可发布行业资料 ${kbItems.length} 份</small></h2>
  <div class="statline">公开原文优先链接；知识库原文可直接点击阅读。历史日报不入本档案。</div>
  <div class="grid">${priCards}</div>
  ${kbMore.length ? `<details class="kb"><summary>更多行业资料（${kbMore.length} 份）</summary><ul class="kb-list">${moreLis}</ul></details>` : ''}
  </main>`;
}
writeFile(path.join(ROOT, 'archive.html'), renderShell({ current: 'archive', title: '陈瑶的商业晨报｜更早', body: archiveBody('') }));

/* ---------- 知识库原文阅读页 ---------- */
function knowledgeHtml() {
  const mapKeys = Object.keys(docsMap).map((k) => `'${k}':'${docsMap[k].replace(/'/g, "\\'")}'`).join(',');
  const script = `const docs={${mapKeys}};const target=document.getElementById('doc'),key=new URLSearchParams(location.search).get('doc');const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const inline=s=>esc(s).replace(/!\\[([^\\]]*)\\]\\((https?:[^)]+)\\)/g,'<img src="$2" alt="$1" loading="lazy">').replace(/\\[([^\\]]+)\\]\\((https?:[^)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1 ↗</a>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');function render(md){let out='',list=false,rows=[];const flushList=()=>{if(list){out+='</ul>';list=false}},flushTable=()=>{if(rows.length){out+='<table>'+rows.map((r,i)=>'<tr>'+r.split('|').filter(Boolean).map(x=>(i===0?'<th>':'<td>')+inline(x.trim())+(i===0?'</th>':'</td>')).join('')+'</tr>').join('')+'</table>';rows=[]}};md.replace(/^---[\\s\\S]*?---\\s*/,'').split('\\n').forEach(line=>{if(/^\\|/.test(line)&&/\\|$/.test(line)){flushList();if(!/^\\|?\\s*[-:]+/.test(line))rows.push(line);return}flushTable();if(/^#\\s+/.test(line)){flushList();out+='<h1>'+inline(line.replace(/^#\\s+/,''))+'</h1>'}else if(/^##\\s+/.test(line)){flushList();out+='<h2>'+inline(line.replace(/^##\\s+/,''))+'</h2>'}else if(/^###\\s+/.test(line)){flushList();out+='<h3>'+inline(line.replace(/^###\\s+/,''))+'</h3>'}else if(/^>\\s?/.test(line)){flushList();out+='<blockquote>'+inline(line.replace(/^>\\s?/,''))+'</blockquote>'}else if(/^[-*]\\s+/.test(line)){if(!list){out+='<ul>';list=true}out+='<li>'+inline(line.replace(/^[-*]\\s+/,''))+'</li>'}else if(line.trim()){flushList();out+='<p>'+inline(line)+'</p>'}});flushList();flushTable();return out}if(!key||!docs[key]){target.innerHTML='<section class="empty"><h1>未找到原文</h1><p>请从“更早”页的知识库行业档案进入。</p></section>'}else{document.title='陈瑶的商业晨报｜'+docs[key];fetch('kb-originals/'+encodeURIComponent(key)).then(r=>r.ok?r.text():Promise.reject()).then(md=>target.innerHTML=render(md)).catch(()=>target.innerHTML='<section class="empty"><h1>原文暂时无法加载</h1><p>请返回档案页后重试。</p></section>')}`;
  const body = `<main class="wrap"><p class="eyebrow">CHEN YAO · KNOWLEDGE ARCHIVE</p><a class="back" href="archive.html">← 返回更早</a><article class="doc" id="doc"><p>正在加载知识库原文…</p></article></main>`;
  return renderShell({ current: 'archive', title: '陈瑶的商业晨报｜知识库原文', extraHead: `<style>.back{display:inline-flex;margin:12px 0 18px;color:var(--accent);font-weight:600;text-decoration:none}.doc{padding:26px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);max-width:820px}.doc h1{font-size:28px;line-height:1.3;margin:0 0 16px}.doc h2{margin:26px 0 10px;font-size:21px}.doc h3{margin:20px 0 8px;font-size:17px}.doc p{margin:10px 0;color:var(--ink-soft)}.doc blockquote{margin:14px 0;padding:10px 14px;border-left:3px solid var(--accent);background:rgba(0,113,227,.05);color:var(--muted)}.doc ul{margin:8px 0;padding-left:22px}.doc li{margin:5px 0}.doc img{display:block;max-width:100%;height:auto;margin:16px auto;border-radius:12px}.doc table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13px}.doc th,.doc td{padding:8px;border:1px solid var(--line);text-align:left;vertical-align:top}.doc th{background:var(--paper)}</style>`, body, footnote: '知识库原文仅收录可公开发布的行业资料。' }) + `<script>${script}</script>`;
}
writeFile(path.join(ROOT, 'knowledge.html'), knowledgeHtml().replace('<script src="assets/app.js"></script>', '<script src="assets/app.js"></script>'));

/* ---------- 首页 = 最新一日 ---------- */
const latestPage = dailyPages[dayMeta.length - 1];
/* 首页位于根目录，需去掉 daily 内页的全部 ../ 相对前缀 */
const indexPage = latestPage.split('"../').join('"');
writeFile(path.join(ROOT, 'index.html'), indexPage);

/* ---------- 数据索引 ---------- */
writeFile(path.join(ROOT, 'data', 'index.json'), JSON.stringify({ latest: latest.date, days: dayMeta.map(({ date, count, hero }) => ({ date, count, hero })), designCases: cases.length, designPast: pastCases.length, huaian: huaLabeled.map(([l, its]) => [l, its.length]), kb: kbItems.length }, null, 2));

console.log('\n=== 迁移完成 ===');
console.log(`日报 ${dayMeta.length} 期 → daily/`);
console.log(`设计案例 ${cases.length} + 往期 ${pastCases.length}`);
console.log(`淮安 ${huaLabeled.reduce((s, [, its]) => s + its.length, 0)} 条`);
console.log(`知识库原文 ${kbItems.length} 份`);
console.log(`最新一期：${latest.date}（${latest.count} 条）`);
