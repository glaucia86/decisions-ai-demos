import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, relative, extname, dirname } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = resolve('docs/demo-scripts');
const expected = { 'alo-ti': '65caed81e981100aea2f548678372cb9abf9de8313fcb6e04b2f7551fe19220a', triagem: '2aa8a8ef13773b3a4de92d474d167cc4ab8207060835472c4210dcf4b7e9fa23' };
test('original scripts remain byte-exact; adapted local links and controls work offline', async () => {
  for (const [name, hash] of Object.entries(expected)) {
    const bytes = await readFile(resolve(root, `originals/roteiro-demo-${name}.html`));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    const adapted = await readFile(resolve(root, `roteiro-demo-${name}.html`), 'utf8');
    assert.ok(adapted.includes('cd decisions-ai-demos'));
    assert.ok(!adapted.includes('cd apps/decisions'));
    assert.ok(!adapted.includes('MESA_LIVE_ENABLED=true'));
    assert.ok(adapted.includes('não é uma cópia byte a byte'));
  }
  const server = createServer(async (req, res) => {
    try {
      const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (relative(root, p).startsWith('..')) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', extname(p) === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
      res.end(await readFile(p));
    } catch { res.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch();
    await mkdir('test-results/demo-scripts', { recursive: true });
    for (const prefix of ['', 'originals/']) {
      for (const name of ['alo-ti', 'triagem']) {
        const filename = `${prefix}roteiro-demo-${name}.html`;
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
        try {
          await context.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', e => errors.push(e.message));
          await page.goto(`${base}/${filename}`);
          for (const href of await page.locator('a[href]').evaluateAll(xs => xs.map(x => x.getAttribute('href')))) {
            if (/^https?:/.test(href)) continue;
            const [file, anchor] = href.split('#');
            if (file) assert.ok((await stat(resolve(root, dirname(filename), file))).isFile(), href);
            else if (anchor) assert.equal(await page.locator(`[id="${anchor}"]`).count(), 1, href);
          }
          for (const button of await page.locator('button[data-copy]').all()) {
            const target = await button.getAttribute('data-copy');
            const wanted = (await page.locator(`[id="${target}"]`).innerText()).trim();
            await button.click();
            await page.waitForFunction(async text => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n') === text.replaceAll('\r\n', '\n'), wanted);
            assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), wanted.replaceAll('\r\n', '\n'));
          }
          await page.evaluate(async () => {
            const clipboard = navigator.clipboard;
            await clipboard.writeText('clipboard fallback sentinel');
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: clipboard.readText.bind(clipboard), writeText: async () => { throw Error('Test clipboard fallback'); } } });
          });
          const fallback = page.locator('button[data-copy]').first();
          const fallbackTarget = await fallback.getAttribute('data-copy');
          const fallbackText = (await page.locator(`[id="${fallbackTarget}"]`).innerText()).trim();
          await fallback.evaluate(button => { button.textContent = 'Copiar fala'; });
          await fallback.click();
          await page.waitForFunction(async text => (await navigator.clipboard.readText()) === text, fallbackText);
          assert.match(await fallback.innerText(), /Copiado/);
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fallbackText);
          await page.locator('#stage-toggle').click();
          assert.equal(await page.locator('#stage-toggle').getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('#preparacao').isVisible(), false);
          await page.reload();
          assert.equal(await page.locator('#stage-toggle').getAttribute('aria-pressed'), 'true');
          await page.locator('a[href="#preparacao"]').first().click();
          assert.equal(await page.locator('#stage-toggle').getAttribute('aria-pressed'), 'false');
          await page.locator('input[data-check]').first().check();
          await page.reload();
          assert.equal(await page.locator('input[data-check]').first().isChecked(), true);
          assert.match(await page.locator('#done-count').innerText(), /^1\//);
          await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
          await page.locator('#print-btn').click();
          assert.equal(await page.evaluate(() => window.__printed), true);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.screenshot({ path: `test-results/demo-scripts/${prefix ? 'original-' : ''}${name}-desktop.png` });
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, filename + ' mobile overflow');
          await page.screenshot({ path: `test-results/demo-scripts/${prefix ? 'original-' : ''}${name}-mobile.png` });
          const other = name === 'alo-ti' ? 'triagem' : 'alo-ti';
          await page.locator(`a[href="roteiro-demo-${other}.html"]`).click();
          assert.ok(page.url().endsWith(`roteiro-demo-${other}.html`));
          await page.locator('a.logo').click();
          assert.ok(page.url().endsWith('/index.html'));
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
