// 知行站构建脚本
// 输入：content/notes/*.md（随笔）+ works.json / books.json（数据）+ studio.html/css/js（页面）
// 输出：dist/（部署用）+ 根目录 notes/ 与 notes.json（本机 8899 预览用）
// 随笔工作流：往 content/notes/ 放一个 md → npm run build → 首页自动多一张卡片，文章页落位 /notes/<slug>/
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const md = new MarkdownIt({ html: false, linkify: true });

const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 随笔解析 ----------
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('缺少 frontmatter（--- 开头的元信息块）');
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: m[2] };
}

function splitBody(body) {
  const marker = body.match(/\r?\n<<EN>>\r?\n/);
  if (!marker) return { zh: body, en: null };
  return { zh: body.slice(0, marker.index), en: body.slice(marker.index + marker[0].length) };
}

const blocksOf = text => text.split(/\r?\n\s*\r?\n/).map(s => s.trim()).filter(Boolean);

// 给 markdown-it 渲染出的块级 HTML 根元素注入 data-en 属性（双语切换沿用 data-en 机制）
function injectDataEn(blockHtml, enText) {
  return blockHtml.replace(/^<([a-zA-Z][a-zA-Z0-9]*)/, `<$1 data-en="${escAttr(enText)}"`);
}

// ---------- 文章页模板 ----------
const SUNMARK = '<svg class="sunmark" viewBox="0 0 48 48" aria-hidden="true"><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M24 3v5m0 32v5M3 24h5m32 0h5M9 9l4 4m22 22 4 4M9 39l4-4m22-22 4-4"/><circle cx="24" cy="24" r="10" fill="currentColor" stroke="none"/></g></svg>';

const ARTICLE_LANG_JS = `(function(){var d=document;var q=new URLSearchParams(location.search);var stored=null;try{stored=localStorage.getItem('zhixing-lang')}catch(e){}
var lang=q.get('lang')==='en'?'en':(stored==='en'?'en':'zh');
var t=[].map.call(d.querySelectorAll('[data-en]'),function(e){return{e:e,zh:e.innerHTML,en:e.getAttribute('data-en')}});
function apply(){d.documentElement.lang=lang==='en'?'en':'zh-CN';t.forEach(function(x){x.e.innerHTML=lang==='en'?x.en:x.zh});
var b=d.getElementById('language');if(b){b.innerHTML=(lang==='en'?'中文':'EN')+' <span aria-hidden="true">↗</span>';b.setAttribute('aria-label',lang==='en'?'切换到中文':'Switch to English')}}
var btn=d.getElementById('language');if(btn){btn.addEventListener('click',function(){lang=lang==='zh'?'en':'zh';try{localStorage.setItem('zhixing-lang',lang)}catch(e){}
var u=new URL(location.href);if(lang==='en'){u.searchParams.set('lang','en')}else{u.searchParams.delete('lang')}
history.replaceState(null,'',u);apply()})}
apply()})();`;

function articlePage(n) {
  const draft = n.draft
    ? `\n      <p class="draft-label" data-en="${escAttr('Layout sample · wording for your review')}">随笔样稿 · 正文待你确认</p>`
    : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#faf9f6">
  <meta name="description" content="${escAttr(n.deck || n.title)}">
  <title data-en="${escAttr(n.titleEn ? n.titleEn + ' — Zhixing' : n.title + ' — 知行')}">${escHtml(n.title)} — 知行</title>
  <link rel="icon" href="/assets-studio/sun.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/studio.css">
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "22ec4a1f3e9c46c6805ec89e63fec192"}'></script>
</head>
<body>
<header class="note-top"><div class="wrap note-top-in">
    <a class="brand" href="/" aria-label="知行 · 首页">${SUNMARK}<span class="brand-name">知行</span><span class="brand-divider">/</span><span class="brand-handle">DreamOfXM</span></a>
    <button class="lang-button" id="language" aria-label="Switch to English">EN <span aria-hidden="true">↗</span></button>
  </div></header>
<main class="wrap" id="top">
  <article class="note-shell">
    <div class="article-body">${draft}
      <h1 data-en="${escAttr(n.titleEn || n.title)}">${escHtml(n.title)}</h1>${n.deck ? `
      <p class="article-deck" data-en="${escAttr(n.deckEn || n.deck)}">${escHtml(n.deck)}</p>` : ''}
      <p class="note-date" data-en="${escAttr(n.date + ' · Zhixing')}">${n.date} · 知行</p>
      ${n.blocksHtml}
      <div class="article-end"><span>知行 / DreamOfXM</span><span aria-hidden="true">✳</span></div>
    </div>
    <section class="note-comments" id="comments" hidden><!-- 评论挂载点：将来接入 Cloudflare Workers + D1（复用燎原 /api/comments 配方）后，由脚本在此渲染评论列表与表单。 --></section>
  </article>
</main>
<footer class="wrap note-foot"><a href="/">← 回到首页</a><a href="#top">回到顶部 ↑</a></footer>
<script>${ARTICLE_LANG_JS}</script>
</body>
</html>
`;
}

// ---------- 主流程 ----------
function buildNotes() {
  const srcDir = join(ROOT, 'content', 'notes');
  if (!existsSync(srcDir)) return [];
  const notes = [];
  for (const file of readdirSync(srcDir).filter(f => f.endsWith('.md')).sort()) {
    const { data, body } = parseFrontmatter(readFileSync(join(srcDir, file), 'utf8'));
    for (const required of ['title', 'date', 'slug']) {
      if (!data[required]) throw new Error(`${file} 缺少 frontmatter 字段：${required}`);
    }
    const { zh, en } = splitBody(body);
    const zhBlocks = blocksOf(zh);
    const enBlocks = en ? blocksOf(en) : null;
    const pair = enBlocks && enBlocks.length === zhBlocks.length;
    if (en && !pair) console.warn(`⚠ ${file}：中英段落数不一致（zh ${zhBlocks.length} / en ${enBlocks.length}），英文对照已跳过`);
    const blocksHtml = zhBlocks.map((b, i) => {
      const html = md.render(b).trim();
      // 英文对照喂纯文本：剥掉引用符等 markdown 记号
      const enPlain = pair ? enBlocks[i].replace(/^>\s?/g, '') : '';
      return pair ? injectDataEn(html, enPlain) : html;
    }).join('\n      ');
    notes.push({
      slug: data.slug,
      title: data.title,
      titleEn: data.title_en || data.title,
      deck: data.deck || '',
      deckEn: data.deck_en || data.deck || '',
      excerpt: data.excerpt || blocksOf(zh)[0]?.replace(/[#>*]/g, '').slice(0, 60) || '',
      excerptEn: data.excerpt_en || (enBlocks ? enBlocks[0].replace(/[#>*]/g, '').slice(0, 90) : ''),
      date: data.date,
      draft: data.draft === 'true',
      url: `/notes/${data.slug}/`,
      blocksHtml,
    });
  }
  return notes;
}

function writeManifest(notes, dir) {
  const manifest = notes.map(({ blocksHtml, ...rest }) => rest);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'notes.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function buildDist(notes) {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  // 静态资产
  for (const f of ['studio.css', 'studio.js', 'works.json', 'books.json']) {
    cpSync(join(ROOT, f), join(DIST, f));
  }
  cpSync(join(ROOT, 'assets-studio'), join(DIST, 'assets-studio'), { recursive: true });
  // 首页 = studio.html，部署版去掉草稿 noindex
  const indexHtml = readFileSync(join(ROOT, 'studio.html'), 'utf8')
    .replace(/\n\s*<meta name="robots" content="noindex[^"]*">/, '');
  writeFileSync(join(DIST, 'index.html'), indexHtml);
  // 文章页 + 清单
  writeManifest(notes, DIST);
  for (const n of notes) {
    const dir = join(DIST, 'notes', n.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), articlePage(n));
  }
}

function buildRootPreview(notes) {
  writeManifest(notes, ROOT);
  for (const n of notes) {
    const dir = join(ROOT, 'notes', n.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), articlePage(n));
  }
}

const notes = buildNotes();
buildRootPreview(notes);
buildDist(notes);
console.log(`✓ 构建完成：${notes.length} 篇随笔 → notes/ + dist/（dist/index.html 已去 noindex）`);
