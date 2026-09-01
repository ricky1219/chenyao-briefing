/* 陈瑶的商业晨报 · 通过 GitHub API 推送（github.com 被网络阻断时的备用通道）
   用法：node scripts/gh-push.cjs "提交信息"
   使用 Git Data API：blobs → trees → commits → refs，走 api.github.com。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'ricky1219';
const REPO = 'chenyao-briefing';
const BRANCH = 'main';
const MESSAGE = process.argv[2] || `Publish briefing ${new Date().toISOString().slice(0, 10)}`;

const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const API = 'https://api.github.com';
const H = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

/* 收集文件（跳过 .git 与 .gitignore 规则） */
const ignored = new Set(['.git', '.DS_Store', 'node_modules', '.obsidian']);
const gitignore = (() => {
  try { return fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch (e) { return []; }
})();
function isIgnored(p) {
  const rel = path.relative(ROOT, p);
  return ignored.has(rel.split('/')[0]) || gitignore.some((g) => rel === g || rel.endsWith('/' + g) || rel.startsWith(g + '/'));
}
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (isIgnored(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(ROOT).sort();
  console.log(`推送 ${files.length} 个文件 → ${OWNER}/${REPO} (${BRANCH})`);

  /* 0. 若仓库为空，先建空树引导提交，使仓库非空 */
  let hasRef = true;
  try { await api('GET', `${API}/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`); }
  catch (e) { hasRef = false; }
  if (!hasRef) {
    console.log('  空仓库：创建引导提交…');
    const emptyTree = await api('POST', `${API}/repos/${OWNER}/${REPO}/git/trees`, { tree: [] });
    const bootCommit = await api('POST', `${API}/repos/${OWNER}/${REPO}/git/commits`, { message: 'init', tree: emptyTree.sha, parents: [] });
    await api('POST', `${API}/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: bootCommit.sha });
  }

  /* 1. 创建 blobs，建立 相对路径 → sha 映射 */
  const blobs = {};
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    const content = fs.readFileSync(f).toString('base64');
    const b = await api('POST', `${API}/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
    blobs[rel] = b.sha;
    console.log(`  blob ${rel}`);
  }

  /* 2. 递归构建 tree */
  async function buildTree(dirRel) {
    const entries = [];
    const names = new Set();
    for (const rel of Object.keys(blobs)) {
      if (!dirRel && !rel.includes('/')) { entries.push({ path: rel, mode: '100644', type: 'blob', sha: blobs[rel] }); names.add(rel); }
      else if (rel.startsWith(dirRel ? dirRel + '/' : '')) {
        const rest = rel.slice(dirRel ? dirRel.length + 1 : 0);
        const first = rest.split('/')[0];
        if (!names.has(first)) {
          names.add(first);
          if (rest.includes('/')) entries.push({ path: first, mode: '040000', type: 'tree', sha: (await buildTree(dirRel ? `${dirRel}/${first}` : first)) });
          else entries.push({ path: first, mode: '100644', type: 'blob', sha: blobs[rel] });
        }
      }
    }
    const t = await api('POST', `${API}/repos/${OWNER}/${REPO}/git/trees`, { tree: entries });
    return t.sha;
  }
  const treeSha = await buildTree('');
  console.log('  tree', treeSha.slice(0, 7));

  /* 3. 取当前 main 的 commit 作为 parent（若有） */
  let parent = null;
  try {
    const ref = await api('GET', `${API}/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    parent = ref.object.sha;
    console.log('  parent', parent.slice(0, 7));
  } catch (e) { console.log('  新分支，无 parent'); }

  /* 4. 创建 commit */
  const commit = await api('POST', `${API}/repos/${OWNER}/${REPO}/git/commits`, {
    message: MESSAGE, tree: treeSha, parents: parent ? [parent] : [],
  });
  console.log('  commit', commit.sha.slice(0, 7));

  /* 5. 更新 ref */
  try {
    await api('PATCH', `${API}/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
  } catch (e) {
    await api('POST', `${API}/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  }
  console.log(`  ✅ 已推送 ${commit.sha} → ${BRANCH}`);
})().catch((e) => { console.error('推送失败：', e.message); process.exit(1); });
