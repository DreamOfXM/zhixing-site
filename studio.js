// 知行站前端逻辑：数据全部来自 works.json / books.json / notes.json（加作品=改 JSON，加随笔=放 md 构建）
const glyphs = {
  spark: '<path d="M12 3c2 6-5 7-5 12a5 5 0 0 0 10 0c0-3-2-4-2-7-1 2-2 3-3 3 1-3 1-5 0-8Z"/><path d="M10 18q2-5 4 0"/>',
  document: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h7m-7 4h7"/>',
  book: '<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/><path d="M12 5v15"/>'
};
// 书架封面插画（手工 SVG，跟 books.json 的 id 对应；加书=books.json 加一行 + 这里补一幅画）
const emblems = {
  mao: '<svg viewBox="0 0 100 100"><path d="M20 70h60M28 60h44M37 50h26M49 17v22m-11-6 11-16 11 16"/><path d="M24 70q26-17 52 0M32 59q18-10 36 0"/></svg>',
  classics: '<svg viewBox="0 0 100 100"><path d="M15 69 38 34l19 27 14-19 17 28M16 77h72M45 45l10-18 18 26"/><circle cx="74" cy="22" r="7"/><path d="m18 86 29-4 36 4"/></svg>',
  bamboo: '<svg viewBox="0 0 100 100"><path d="m48 89 5-78M49 60 25 44m26-5 21-15m-21 0L33 13m17 62 28-21"/><path d="M35 48Q12 50 14 29q16 1 21 19ZM57 34q4-26 25-20-3 19-25 20ZM60 69q7-26 27-19-6 18-27 19Z" fill="currentColor" stroke="none"/></svg>'
};
const noteArt = '<svg viewBox="0 0 140 130"><g transform="rotate(-8 65 60)"><rect x="25" y="13" width="86" height="104" rx="2" fill="#fffdf5" stroke="#d0c6ae"/><path d="M39 36h46m-46 12h59m-59 12h54m-54 12h36" stroke="#c5c7b8" stroke-width="2"/><path d="m70 104 27-51 7 4-27 51-10 6Z" fill="#527366"/><path d="m69 107-2 7 7-4" fill="#bda27b"/></g><path d="m12 25-6-5m11-3-1-8" stroke="#c18c59" stroke-linecap="round"/></svg>';

const stored = (() => { try { return localStorage.getItem('zhixing-lang'); } catch { return null; } })();
let language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : (stored === 'en' ? 'en' : 'zh');
let activeFilter = 'all';
let works = [];
let books = [];
let notes = [];

const translations = [...document.querySelectorAll('[data-en]')].map(element => ({ element, zh: element.innerHTML, en: element.dataset.en }));
const ariaTranslations = [...document.querySelectorAll('[data-aria-en]')].map(element => ({ element, zh: element.getAttribute('aria-label'), en: element.dataset.ariaEn }));
const grid = document.getElementById('project-grid');
const catalog = document.getElementById('catalog-grid');
const bookshelf = document.getElementById('bookshelf');
const notesList = document.getElementById('notes-list');

function localized(item, key) {
  return language === 'en' ? item[`en${key[0].toUpperCase()}${key.slice(1)}`] : item[key];
}

function iconMarkup(project) {
  if (project.image) return `<img class="project-icon" src="${project.image}" alt="" width="47" height="47">`;
  return `<span class="project-icon diagram" style="--tile:#f6ead9;--glyph:#a46639" aria-hidden="true"><svg viewBox="0 0 24 24">${glyphs[project.glyph]}</svg></span>`;
}

function renderProjects() {
  const shown = works.filter(project => activeFilter === 'all' ? project.selected : project.tags?.includes(activeFilter));
  grid.innerHTML = shown.map(project => `<a class="project-card" href="${project.url}" target="_blank" rel="noopener noreferrer">
    <div class="project-top">${iconMarkup(project)}<div><h3 class="project-name">${localized(project, 'name')}</h3><p class="project-type">${localized(project, 'type')}</p></div><span class="project-arrow" aria-hidden="true">↗</span></div>
    <p class="project-description">${localized(project, 'description')}</p>
    <div class="project-foot"><span class="project-tag">${project.local ? (language === 'en' ? 'Local preview' : '本地预览') : project.tags.includes('open') ? (language === 'en' ? 'Open source' : '开源项目') : (language === 'en' ? 'Visit website' : '打开网站')}</span><span class="project-category">${localized(project, 'category')}</span></div>
  </a>`).join('');
  document.getElementById('filter-status').textContent = language === 'en' ? `${shown.length} projects shown` : `已显示 ${shown.length} 件作品`;
  catalog.replaceChildren(...works.map(project => {
    const card = document.createElement('article');
    card.className = 'catalog-item';
    const title = document.createElement('h3');
    title.textContent = localized(project, 'name');
    if (project.url) {
      const link = document.createElement('a');
      link.href = project.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const arrow = document.createElement('span');
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      link.append(title, arrow);
      card.append(link);
    } else card.append(title);
    const description = document.createElement('p');
    description.textContent = localized(project, 'description');
    card.append(description);
    if (!project.url || project.local) {
      const status = document.createElement('small');
      status.textContent = project.local ? (language === 'en' ? 'Local preview' : '本地预览') : (language === 'en' ? 'Public link to be added' : '公开地址待补充');
      status.className = project.local ? 'is-local' : '';
      card.append(status);
    }
    return card;
  }));
}

function renderBooks() {
  bookshelf.innerHTML = books.map(book => {
    const inner = `<span class="book-stage"><span class="book-cover cover-${book.id}"><span class="book-series">${localized(book, 'series')}</span><span class="book-title">${localized(book, 'title')}</span><span class="book-subtitle">${localized(book, 'subtitle')}</span><span class="book-emblem" aria-hidden="true">${emblems[book.id] || ''}</span><span class="book-bottom">${localized(book, 'bottom')}</span></span></span><span class="book-caption"><strong>${localized(book, 'caption')}</strong><span aria-hidden="true">↗</span></span><span class="book-description">${localized(book, 'description')}</span>`;
    return book.href
      ? `<a class="book-item" href="${book.href}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<button class="book-item" data-dialog="${book.dialog}" aria-haspopup="dialog">${inner}</button>`;
  }).join('');
}

function renderNotes() {
  if (!notesList) return;
  notesList.innerHTML = notes.map(note => `<a class="note-card" href="${note.url}">
    <span class="note-art" aria-hidden="true">${noteArt}</span><span class="note-content"><span class="note-meta"><span>${note.date}</span>${note.draft ? `<span class="draft-label">${language === 'en' ? 'Draft sample' : '随笔样稿'}</span>` : ''}</span><strong>${localized(note, 'title')}</strong><span class="note-excerpt">${localized(note, 'excerpt')}</span><span class="note-read">${language === 'en' ? 'Read ↗' : '读一读 ↗'}</span></span><span class="note-arrow" aria-hidden="true">↗</span></a>`).join('');
}

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  translations.forEach(({ element, zh, en }) => { element.innerHTML = language === 'en' ? en : zh; });
  ariaTranslations.forEach(({ element, zh, en }) => { element.setAttribute('aria-label', language === 'en' ? en : zh); });
  const toggle = document.getElementById('language');
  toggle.innerHTML = `${language === 'en' ? '中文' : 'EN'} <span aria-hidden="true">↗</span>`;
  toggle.setAttribute('aria-label', language === 'en' ? '切换到中文' : 'Switch to English');
  document.querySelector('.brand').setAttribute('aria-label', language === 'en' ? 'Zhixing · Home' : '知行 · 首页');
  document.title = language === 'en' ? 'Zhixing — Making, reading, and notes along the way' : '知行 — 做东西，读书，记录生活';
  renderProjects();
  renderBooks();
  renderNotes();
}

document.getElementById('language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('zhixing-lang', language); } catch {}
  const url = new URL(location.href);
  if (language === 'en') url.searchParams.set('lang', 'en');
  else url.searchParams.delete('lang');
  history.replaceState(null, '', url);
  applyLanguage();
});

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(filter => {
      const selected = filter === button;
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', String(selected));
    });
    renderProjects();
  });
});

function openDialog(id) {
  document.getElementById(id).showModal();
  document.body.classList.add('modal-open');
}
document.getElementById('all-works').addEventListener('click', () => openDialog('works-dialog'));
bookshelf.addEventListener('click', event => {
  const item = event.target.closest('[data-dialog]');
  if (item) openDialog(item.dataset.dialog);
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    dialog.close();
  }));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});

(async () => {
  const [worksRes, booksRes, notesRes] = await Promise.all([
    fetch('works.json'), fetch('books.json'), fetch('notes.json')
  ]);
  works = await worksRes.json();
  books = await booksRes.json();
  notes = notesRes.ok ? await notesRes.json() : [];
  applyLanguage();
})();
