import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:8899/studio.html'
results = []
errors = []


def record(name, passed, detail=None):
    results.append({'check': name, 'passed': bool(passed), 'detail': detail})


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_selector('.project-card')
    record('Default selected projects', page.locator('.project-card').count() == 4)
    page.get_by_role('button', name='开源', exact=True).click()
    record('Open source filter', page.locator('.project-card').count() == 2)
    record('Filter announces result', page.locator('#filter-status').inner_text() == '已显示 2 件作品')
    page.get_by_role('button', name='网站', exact=True).click()
    record('Website filter', page.locator('.project-card').count() == 4)
    page.get_by_role('button', name='精选', exact=True).click()
    record('Reset selected filter', page.locator('.project-card').count() == 4)
    for trigger, modal in [('all-works', 'works-dialog'), ('open-mao', 'book-dialog'), ('open-note', 'note-dialog')]:
        page.locator(f'#{trigger}').click()
        record(f'{modal} opens', page.locator(f'#{modal}').is_visible())
        record(f'{modal} scroll lock', page.locator('body').evaluate("el => el.classList.contains('modal-open')"))
        if modal == 'works-dialog':
            record('Catalog contains all source entries', page.locator('.catalog-item').count() == 15)
            record('Unlinked projects are not fake buttons', page.locator('.catalog-item:not(:has(a))').count() == 9)
        if modal == 'book-dialog':
            record('Reading links labelled local', '本机' in page.locator('.local-note').inner_text())
            with page.expect_popup() as popup_info:
                page.get_by_role('link', name='第一卷 实践论').click()
            reading = popup_info.value
            reading.wait_for_load_state('domcontentloaded')
            record('Book opens actual reading article', '实践论' in reading.title(), reading.url)
            reading.close()
        if modal == 'note-dialog':
            record('Essay is identified as sample', page.locator('.article-body .draft-label').inner_text() == '排版样稿 · 正文待你确认')
        page.keyboard.press('Escape')
        record(f'{modal} Escape closes', not page.locator(f'#{modal}').is_visible())
        record(f'{modal} focus returns', page.locator(f'#{trigger}').evaluate('el => el === document.activeElement'))
    page.locator('#open-note').click()
    page.locator('#note-dialog [data-close]').first.click()
    record('Visible back button closes article', not page.locator('#note-dialog').is_visible())
    page.locator('#open-mao').click()
    page.mouse.click(5, 5)
    record('Backdrop click closes book', not page.locator('#book-dialog').is_visible())
    page.locator('#language').click()
    record('Language toggles to English', page.locator('html').get_attribute('lang') == 'en')
    record('English project copy', 'Understand what takes' in page.locator('.project-description').first.inner_text())
    page.reload()
    record('Language survives reload', page.locator('html').get_attribute('lang') == 'en')
    page.locator('#language').click()
    record('Chinese layout restores', page.locator('.underline').count() == 1)
    for width in [320, 360, 390, 768, 1024, 1440, 1920]:
        page.set_viewport_size({'width': width, 'height': 900})
        for lang in ['zh', 'en']:
            page.goto(URL + ('?lang=en' if lang == 'en' else ''))
            page.wait_for_selector('.project-card')
            overflow = page.evaluate('''() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth,
              elements: [...document.querySelectorAll('body *')].filter(el => {
                if (el.closest('dialog') || el.closest('svg') || getComputedStyle(el).display === 'none') return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
              }).map(el => el.className).filter(n => n !== 'skip') })''')
            record(f'No horizontal overflow {width}px {lang}', overflow['body'] <= width and not overflow['elements'], overflow)
            record(f'Images loaded {width}px {lang}', page.locator('img').evaluate_all('els => els.every(el => el.complete && el.naturalWidth > 0)'))
            for trigger, modal in [('all-works', 'works-dialog'), ('open-mao', 'book-dialog'), ('open-note', 'note-dialog')]:
                page.locator(f'#{trigger}').click()
                fits = page.locator(f'#{modal}').evaluate('el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth')
                record(f'{modal} fits {width}px {lang}', fits)
                page.keyboard.press('Escape')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(URL)
    page.locator('nav a[href="#reading"]').click()
    page.wait_for_function("location.hash === '#reading'")
    record('Mobile reading navigation', page.locator('#reading').is_visible())
    page.locator('#open-mao').click()
    for _ in range(12):
        page.keyboard.press('Tab')
        record('Modal prevents focus on background content', page.evaluate("!document.hasFocus() || document.activeElement.closest('dialog')?.id === 'book-dialog'"))
    page.keyboard.press('Escape')
    page.emulate_media(reduced_motion='reduce')
    record('Reduced motion respected', page.evaluate("getComputedStyle(document.documentElement).scrollBehavior === 'auto'"))
    page.goto(URL)
    record('No JavaScript or browser console errors', not errors, errors)
    browser.close()

report = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'sourceHashes': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['studio.html', 'studio.css', 'studio.js']},
    'passed': sum(r['passed'] for r in results),
    'failed': sum(not r['passed'] for r in results),
    'results': results,
}
(ROOT / 'evidence-studio' / 'checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({'passed': report['passed'], 'failed': report['failed'], 'failures': [r for r in results if not r['passed']]}, ensure_ascii=False, indent=2))
raise SystemExit(1 if report['failed'] else 0)
