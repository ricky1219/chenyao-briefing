/* 陈瑶的商业晨报 · 共享渲染库 */
'use strict';
const fs = require('fs');
const path = require('path');

/* 分类 → 配图映射（按分类复用的“晨报配图”） */
const DAILY_COVER = {
  '推广与会员': 'promo.svg',
  '商业地产': 'property.svg',
  '招商与首店': 'retail.svg',
  '零售与餐饮': 'retail.svg',
  '品牌与设计': 'brand.svg',
  '政策与趋势': 'data.svg',
};
const DESIGN_COVER = {
  '推广活动': 'promo.svg',
  '品牌与IP': 'brand.svg',
  '包装与零售': 'retail.svg',
  '视觉资产': 'brand.svg',
  '往期精选': 'data.svg',
};
const DEFAULT_COVER = 'data.svg';

function coverFor(category, map) {
  return (map && map[category]) || DEFAULT_COVER;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const NAV = [
  ['昨日', 'index.html', 'index'],
  ['更早', 'archive.html', 'archive'],
  ['设计', 'design.html', 'design'],
  ['淮安', 'huaian.html', 'huaian'],
];

function renderShell(opts) {
  const { prefix = '', current, title, dateChip = '', extraHead = '', body, footnote = '' } = opts;
  const navItem = (href, label, key) =>
    `<a href="${prefix}${href}"${current === key ? ' class="current"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${prefix}assets/app.css">
${extraHead}
</head>
<body>
<header class="topbar"><div class="topbar-inner">
  <div class="brand"><a class="logo" href="${prefix}index.html" style="color:inherit;text-decoration:none">陈瑶的商业晨报<small>CHEN YAO · DAILY BRIEFING</small></a></div>
  ${dateChip ? `<span class="date-chip">${esc(dateChip)}</span>` : ''}
  <div class="topnav">${NAV.map(([l, h, k]) => navItem(h, l, k)).join('')}<button class="refresh-btn" data-refresh>刷新</button></div>
</div></header>
${body}
<nav class="bottomnav">${NAV.map(([l, h, k]) => `<a href="${prefix}${h}"${current === k ? ' class="current"' : ''}><span>${l}</span></a>`).join('')}</nav>
<footer class="footnote">${footnote || '陈瑶的商业晨报 · 每日 08:00 更新 · 仅收录可公开核验的独立报道'}</footer>
<script src="${prefix}assets/app.js"></script>
</body>
</html>`;
}

/* 新闻卡（日报）item=[date,source,title,summary,takeaway,keywords,link,image] */
function dailyCard(category, item, prefix) {
  const [date, source, title, summary, takeaway, keywords, link] = item;
  const cover = `${prefix}assets/covers/${coverFor(category, DAILY_COVER)}`;
  const href = link && /^https?:/.test(link) ? link : '';
  const kw = String(keywords || '').split(/[,，、/|]+/).filter(Boolean).slice(0, 4);
  return `<article class="card" data-group="${esc(category)}">
  <img class="preview" src="${cover}" alt="" loading="lazy" decoding="async" fetchpriority="low">
  <div class="meta"><span class="chip">${esc(category)}</span><span class="src">${esc(source || '')}</span><span class="date">${esc(date || '')}</span></div>
  <h3>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</h3>
  <p class="summary">${esc(summary || '')}</p>
  ${takeaway ? `<p class="takeaway">可借鉴：${esc(takeaway)}</p>` : ''}
  <div class="foot">${kw.length ? `<div class="kw">${kw.map((k) => `<span>${esc(k)}</span>`).join('')}</div>` : '<span></span>'}
  ${href ? `<a class="link" href="${esc(href)}" target="_blank" rel="noopener">查看原文 ↗</a>` : ''}</div>
</article>`;
}

/* 设计卡 item=[category,type,title,source,takeaway,link,image] */
function designCard(item, prefix) {
  const [category, type, title, source, takeaway, link, image] = item;
  const cover = image && /^https?:/.test(image)
    ? image
    : `${prefix}assets/covers/${coverFor(category, DESIGN_COVER)}`;
  const href = link && /^https?:/.test(link) ? link : '';
  return `<article class="card" data-group="${esc(category)}">
  <img class="preview" src="${esc(cover)}" alt="" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer">
  <div class="meta"><span class="chip">${esc(type || '')}</span><span class="src">${esc(source || '')}</span></div>
  <h3>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</h3>
  ${takeaway ? `<p class="takeaway">可借鉴：${esc(takeaway)}</p>` : ''}
  <div class="foot">${href ? `<a class="link" href="${esc(href)}" target="_blank" rel="noopener">查看原图 ↗</a>` : ''}</div>
</article>`;
}

/* 淮安卡 item=[dateSrc,title,summary,link,groupLabel] */
function huaianCard(item, groupLabel, prefix) {
  const [dateSrc, title, summary, link] = item;
  const tagClass = groupLabel === '本地最新' ? 'latest' : groupLabel === '商业资料库' ? 'lib' : 'major';
  const href = link && /^https?:/.test(link) ? link : '';
  return `<article class="card" data-group="${esc(groupLabel)}">
  <div class="meta"><span class="hua-tag ${tagClass}">${esc(groupLabel)}</span><span class="src">${esc(dateSrc || '')}</span></div>
  <h3>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</h3>
  <p class="summary">${esc(summary || '')}</p>
  <div class="foot">${href ? `<a class="link" href="${esc(href)}" target="_blank" rel="noopener">查看原文 ↗</a>` : ''}</div>
</article>`;
}

/* 日报页面渲染 */
function renderDailyPage(o) {
  const { date, range, displayDate, heroTitle, heroText, observe = [], groups = [], stats = {}, prefix = '', nav = 'index' } = o;
  const categories = ['推广与会员', '商业地产', '招商与首店', '零售与餐饮', '品牌与设计', '政策与趋势'];
  const bodies = [];
  observe.forEach((text) => {
    const dot = text.indexOf('。');
    const head = dot > 0 ? text.slice(0, dot + 1) : text;
    const rest = dot > 0 ? text.slice(dot + 1) : '';
    bodies.push(`<li><b>${esc(head)}</b>${esc(rest)}</li>`);
  });
  const statParts = [];
  if (stats.total != null) statParts.push(`昨日共 <b>${stats.total}</b> 条`);
  if (stats.candidates != null) statParts.push(`候选 <b>${stats.candidates}</b> · 深读 <b>${stats.deepRead}</b>`);
  if (stats.kbMatches != null) statParts.push(`知识库新增 <b>${stats.kbMatches}</b>`);
  if (stats.huaianLatest != null) statParts.push(`淮安最新 <b>${stats.huaianLatest}</b>`);
  if (statParts.length) statParts.unshift(`昨日范围：<b>${esc(range)}</b>`);
  const body = `<main class="wrap">
  <p class="eyebrow">CHEN YAO · COMMERCIAL BRIEFING · 昨日版</p>
  <h1 class="display">${heroTitle || '商业晨报'}</h1>
  <p class="lede">${esc(heroText || `仅收录 ${range} 发布、可公开核验的独立报道`)}</p>
  ${statParts.length ? `<div class="statline">${statParts.join(' · ')}</div>` : ''}
  <section class="observe"><h2>今日观察</h2><ol>${bodies.join('') || '<li>暂无观察。</li>'}</ol></section>
  <div class="filters" data-filterbar><button data-f="all" class="active">全部</button>${categories.map((c) => `<button data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <p class="filter-note" data-filter-note></p>
  ${groups.map(([category, items]) => `<div class="grid" data-group="${esc(category)}">${items.map((it) => dailyCard(category, it, prefix)).join('')}</div>`).join('\n')}
  <div class="empty">当前分类暂无内容。</div>
  </main>`;
  return renderShell({ prefix, current: nav, title: `陈瑶的商业晨报｜${displayDate}`, dateChip: displayDate, body });
}

module.exports = {
  esc, coverFor, DAILY_COVER, DESIGN_COVER, renderShell, dailyCard, designCard, huaianCard, renderDailyPage,
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  writeFile: (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); },
};
