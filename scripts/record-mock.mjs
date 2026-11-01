import { chromium } from 'playwright';
import { mkdir, copyFile } from 'node:fs/promises';

const base = new URL(process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3000').origin;
await mkdir('docs/media', { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: 'test-results/video', size: { width: 1440, height: 1000 } }, serviceWorkers: 'block' });
  // Only local app resources. Recording cannot call OpenAI or start live.
  await context.route('**/*', route => new URL(route.request().url()).origin === base && !route.request().url().includes('/api/live') ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.textContent = 'SIMULADO · fixtures locais · sem API / microfone';
    label.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:99999;padding:10px 18px;background:#102e2b;color:white;border-radius:8px;font:600 16px sans-serif;pointer-events:none';
    document.body.append(label);
  });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Explorar cenário' }).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Analisar relato', exact: true }).click();
  await page.getByRole('heading', { name: 'Acessos e identidade', exact: true }).waitFor();
  await page.waitForTimeout(1800);
  await page.getByLabel('Revisei o relato e a equipe responsável.').check();
  await page.getByRole('button', { name: 'Confirmar e criar ticket simulado' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'docs/media/alo-ti.png', fullPage: true });
  const video = page.video();
  await context.close();
  await video.saveAs('docs/media/mock-demo.webm');
  await copyFile('test-results/triage-audio-recovered.png', 'docs/media/triagem.png');
  console.log('MOCK_VIDEO_PASS: docs/media/mock-demo.webm; local fixtures only.');
} finally { await browser.close(); }
