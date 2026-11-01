import { chromium } from 'playwright';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Uso: node record.mjs <alo-live|triagem-real> <saida> <fala.wav>
// Argumentos posicionais prevalecem sobre DEMO_MODE, DEMO_OUTPUT_DIR e DEMO_SPEECH_WAV.
const mode = process.argv[2] || process.env.DEMO_MODE;
const out = resolve(process.argv[3] || process.env.DEMO_OUTPUT_DIR || 'demo-output');
const wavArgument = process.argv[4] || process.env.DEMO_SPEECH_WAV;
const base = process.env.DEMO_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.MESA_LIVE_ACCESS_TOKEN || '';
const REAL = 'MODO REAL · GPT-Live + Decisions';
const SIMULATED = 'MODO SIMULADO · fixtures, sem API';
const timing = { click: null, rec: null, log: [] };
let browser, context, page, startedAt;
let outputReady = false;
let closed = false;
const sleep = ms => page.waitForTimeout(ms);
const log = (etapa, via, resultado) => timing.log.push({
  ms: Date.now() - startedAt, etapa, via, resultado,
});

async function caption(text, tag = REAL) {
  await page.evaluate(([text, tag]) => {
    let element = document.getElementById('__demo_caption');
    if (!element) {
      element = document.createElement('div');
      element.id = '__demo_caption';
      element.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:12px 24px;background:rgba(10,30,28,.94);color:#fff;font:600 24px/1.35 system-ui,sans-serif;pointer-events:none;display:flex;gap:14px;align-items:center';
      document.body.append(element);
    }
    const badge = document.createElement('span');
    badge.textContent = tag;
    badge.style.cssText = 'background:#f5b800;color:#111;border-radius:6px;padding:3px 10px;font-size:17px;white-space:nowrap';
    const line = document.createElement('span');
    line.textContent = text;
    element.replaceChildren(badge, line);
  }, [text, tag]);
}

async function scrollTo(locator) {
  await locator.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(900);
}

async function armRecorder() {
  // Observamos o áudio antes do clique para não perder o início da resposta.
  await page.evaluate(() => {
    window.__demoAudio = { chunks: [], recorder: null, started: null };
    const state = window.__demoAudio;
    state.poll = setInterval(() => {
      const stream = document.querySelector('audio')?.srcObject;
      if (!stream?.getAudioTracks().length || state.recorder) return;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = event => { if (event.data.size) state.chunks.push(event.data); };
      state.stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.start(500);
      state.started = Date.now();
      state.recorder = recorder;
      clearInterval(state.poll);
    }, 20);
  });
}

async function saveAudio() {
  const audio = await page.evaluate(async () => {
    const state = window.__demoAudio;
    if (!state) return null;
    clearInterval(state.poll);
    if (!state.recorder) return null;
    if (state.recorder.state !== 'inactive') state.recorder.stop();
    // Mesmo se as tracks já terminaram, aguardamos o último dataavailable.
    await state.stopped;
    const bytes = new Uint8Array(await new Blob(state.chunks).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { b64: btoa(binary), started: state.started };
  });
  if (!audio?.b64) throw new Error('Áudio do assistente ausente.');
  timing.rec = audio.started - startedAt;
  await writeFile(join(out, `${mode}-assistant.webm`), Buffer.from(audio.b64, 'base64'));
}

async function begin(tokenSelector, buttonName) {
  await caption('Código local (não é a chave OpenAI) e consentimento de custo.');
  const input = page.locator(tokenSelector);
  await scrollTo(input);
  if (await input.getAttribute('type') !== 'password') throw new Error('Campo de acesso sem máscara.');
  await input.fill(token);
  await page.getByLabel('Entendi o envio de áudio e texto').check();
  await sleep(1500);
  await caption('Sessão real. O microfone é virtual e toca falas sintetizadas; não é uma pessoa falando.');
  await armRecorder();
  timing.click = Date.now() - startedAt;
  await page.getByRole('button', { name: buttonName, exact: true }).click();
}

async function endSession() {
  const triage = mode === 'triagem-real';
  const button = page.getByRole('button', { name: triage ? 'Encerrar triagem' : 'Encerrar conversa', exact: true });
  if (!await button.isVisible() || !await button.isEnabled()) return;
  await caption('Encerrando: aguardando a confirmação de fechamento remoto da sessão.');
  await button.click();
  if (triage) {
    const result = page.getByRole('region', { name: 'Resultado da triagem' });
    await result.waitFor({ timeout: 30000 });
    await scrollTo(result);
  } else {
    await page.getByText('Microfone desligado', { exact: true }).first().waitFor({ timeout: 30000 });
  }
  closed = true;
  log('encerrar', 'botão', 'interface confirmou encerramento');
  await sleep(3500);
}

const until = async seconds => sleep(Math.max(0, startedAt + timing.click + seconds * 1000 - Date.now()));

async function showSpeech(line, index) {
  await until(Math.max(0, line.start - 1.5));
  // O WAV não pausa. Não atribuímos uma fala futura a uma etapa atrasada.
  if (Date.now() > startedAt + timing.click + line.end * 1000) {
    log(`fala ${index + 1}`, 'não determinado', 'janela da fala já passou; gravação interrompida');
    throw new Error('Roteiro atrasado em relação ao WAV.');
  }
  await caption(`Fala ${index + 1} (voz sintetizada → microfone virtual): “${line.text}”`);
}

async function voiceCount(command) {
  return page.locator('.command-log li').evaluateAll((items, command) => items.filter(item =>
    item.querySelector('code')?.textContent === command && item.querySelector('span')?.textContent === 'feito',
  ).length, command);
}

async function simulatedIntro() {
  await page.goto(base, { waitUntil: 'networkidle' });
  await caption('Alô, TI — parte 1: respostas preparadas (fixtures), sem API e sem microfone.', SIMULATED);
  await sleep(4500);
  await page.getByRole('button', { name: 'Explorar cenário', exact: true }).click();
  await sleep(2500);
  await page.getByRole('button', { name: 'Analisar relato', exact: true }).click();
  await page.getByRole('heading', { name: 'Acessos e identidade', exact: true }).waitFor();
  await caption('A análise simulada sugere uma equipe. A pessoa revisa antes de criar o ticket.', SIMULATED);
  await sleep(4000);
  await page.getByLabel('Revisei o relato e a equipe responsável.').check();
  await page.getByRole('button', { name: 'Confirmar e criar ticket simulado', exact: true }).click();
  await caption('Ticket simulado criado após revisão. Nenhum sistema externo recebe nada.', SIMULATED);
  await sleep(5000);
  log('introdução simulada', 'botões', 'fluxo com fixtures');
  await page.getByRole('button', { name: /OpenAI ao vivo/ }).click();
  await caption('Parte 2: GPT-Live conversa por voz e o Decisions classifica o relato.');
  await sleep(2500);
}

async function recordAlo(lines) {
  await simulatedIntro();
  await begin('#demo-token', 'Iniciar conversa real');
  await page.getByText('Microfone ativo', { exact: true }).first().waitFor({ timeout: 40000 });
  const report = page.locator('#live-incident');
  const analysis = page.getByRole('button', { name: 'Analisar com Decisions', exact: true });
  const review = page.getByLabel('Revisei este relato ao vivo e a equipe.');
  const steps = [
    { name: 'registrar', command: 'registrar_relato', wait: 12 },
    { name: 'analisar 1', command: 'analisar', wait: 14 },
    { name: 'corrigir', command: 'corrigir_relato', wait: 9 },
    { name: 'analisar 2', command: 'analisar', wait: 12 },
    { name: 'confirmar', command: 'confirmar_ticket', wait: 9 },
  ];
  for (const [i, step] of steps.entries()) {
    // Capturamos a contagem antes da fala, não o texto produzido pelo modelo.
    const before = await voiceCount(step.command);
    await showSpeech(lines[i], i);
    await scrollTo(page.locator(step.command === 'analisar' ? '.decision-panel' : '.conversation'));
    await until(lines[i].end + step.wait);
    const voice = await voiceCount(step.command) > before;
    let via = voice ? 'voz' : 'não determinado';
    if (!voice) {
      if (step.command === 'registrar_relato' || step.command === 'corrigir_relato') {
        await caption('O comando por voz não foi observado: usando o campo de texto (fallback documentado).');
        await report.fill(i === 0
          ? lines[i].text.replace(/^Registra este relato:\s*/i, '')
          : lines[i].text.replace(/^Corrige:\s*/i, ''));
        via = 'campo de texto';
      } else {
        const button = step.command === 'analisar' ? analysis
          : page.getByRole('button', { name: 'Confirmar ticket simulado ao vivo', exact: true });
        if (await button.isVisible() && await button.isEnabled()) {
          via = step.command === 'analisar' ? 'botão Analisar com Decisions' : 'botão Confirmar';
          await caption(`O comando por voz não foi observado: usando ${via} (fallback documentado).`);
          // Registramos a tentativa antes de aguardar seu resultado.
          log(step.name, via, 'fallback acionado');
          await button.click();
        }
      }
    }
    if (step.command === 'analisar') {
      await analysis.waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('.input-area button')?.disabled, null, { timeout: 40000 });
      const hasResult = await page.locator('.suggestion .example-badge').innerText() === 'OPENAI · DECISIONS';
      log(step.name, via, hasResult ? 'análise exibida' : 'sem análise confirmada');
      await caption(hasResult ? 'Resultado real do Decisions na tela. A sugestão pode variar a cada execução.' : 'Nenhuma análise foi confirmada nesta etapa.');
      if (i === 3 && await review.isEnabled()) {
        await review.check();
        log('revisar', 'checkbox', 'revisão marcada pelo roteiro de gravação');
        await caption('Revisão marcada na interface pelo roteiro de gravação; o ticket continua sendo simulado.');
      }
    } else if (step.command === 'confirmar_ticket') {
      const ticket = page.locator('.ticket-created');
      const created = await ticket.count() > 0;
      log(step.name, via, created ? 'ticket simulado criado' : 'sem ticket; revisão ou confirmação pendente');
      await caption(created ? 'Ticket simulado criado. O monitoramento usa dados de demonstração.' : 'Nenhum ticket foi criado nesta execução. A tela mostra o estado real.');
      if (created) await scrollTo(ticket);
      await sleep(7000);
    } else {
      log(step.name, via, (await report.inputValue()).trim() ? 'relato presente no campo' : 'relato vazio');
      await caption(step.command === 'corrigir_relato' ? `Correção pelo caminho: ${via}. A edição invalida a análise anterior.` : `Registro pelo caminho: ${via}. Ainda não há ticket.`);
    }
    await sleep(2500);
  }
  await scrollTo(page.locator('.command-log'));
  await caption('Comandos da voz na tela; o JSON de timing também registra os fallbacks usados.');
  await sleep(3500);
}

async function recordTriage(lines) {
  await page.goto(new URL('/triagem', base).href, { waitUntil: 'networkidle' });
  await caption('Triagem ao vivo: a voz escuta, o Decisions classifica e uma pessoa revisa. Dados fictícios.');
  await sleep(4500);
  await begin('#tri-token', 'Iniciar triagem ao vivo');
  await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor({ timeout: 40000 });
  const cards = page.locator('#board .tri-card');
  for (const [i, line] of lines.entries()) {
    const before = await cards.count();
    await showSpeech(line, i);
    await scrollTo(page.locator('.tri-captions').first());
    await until(line.end + 9);
    let via = 'voz ("Registra")';
    if (await cards.count() === before) {
      const button = page.getByRole('button', { name: 'Classificar agora', exact: true });
      if (await button.isEnabled()) {
        via = 'botão Classificar agora';
        await caption('Ainda não há cartão: usando o botão “Classificar agora” (fallback documentado).');
        log(`fala ${i + 1}`, via, 'fallback acionado');
        await button.click();
      }
    }
    try {
      // Não esperamos além da próxima fala: não podemos pausar o microfone virtual.
      const deadline = lines[i + 1]?.start ?? line.end + 40;
      const remaining = startedAt + timing.click + deadline * 1000 - Date.now() - 1000;
      await page.waitForFunction(n => document.querySelectorAll('#board .tri-card').length > n, before, { timeout: Math.max(1, Math.min(30000, remaining)) });
    } catch {
      log(`fala ${i + 1}`, via.startsWith('botão') ? via : 'não determinado', 'sem cartão confirmado; gravação interrompida');
      throw new Error('Cartão não confirmado.');
    }
    log(`fala ${i + 1}`, via, 'cartão observado; atribuição pela ausência/presença do clique de fallback');
    await caption(`Cartão criado pelo Decisions (${via}). Equipe, confiança e urgência são sugestões.`);
    await scrollTo(page.locator('#board'));
    await sleep(2500);
  }
  const human = page.locator('.tri-column.is-review .tri-card').first();
  if (await human.count()) {
    await caption('Revisão humana: o roteiro demonstra a escolha de uma equipe na interface.');
    await scrollTo(human);
    await sleep(3000);
    await human.locator('.tri-route button').first().click();
    log('revisão humana', 'botão de equipe', 'escolha demonstrada pelo roteiro');
    await caption('“Decidido por você”: a equipe foi escolhida na interface.');
  } else {
    await caption('Nenhum caso caiu em Revisão humana nesta rodada (resultado real do modelo).');
  }
  await sleep(3500);
  await page.getByRole('button', { name: /Evidência da última decisão/ }).click();
  await caption('Evidência: a última resposta estruturada do Decisions, com probabilidade, confiança e score.');
  await scrollTo(page.locator('.tri-evidence pre'));
  await sleep(5000);
}

async function main() {
  if (!['alo-live', 'triagem-real'].includes(mode) || !wavArgument || process.argv.length > 5) {
    throw new Error('Parâmetros inválidos.');
  }
  // Não habilitamos tracing/debug: eles podem registrar o preenchimento da senha.
  if (token.length < 32 || process.env.DEBUG || process.env.PWDEBUG) throw new Error('Ambiente inválido.');
  const wav = resolve(wavArgument);
  await access(wav);
  const speech = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'speech.json'), 'utf8'));
  const name = mode === 'alo-live' ? 'alo' : 'triagem';
  const original = name === 'alo'
    ? [[6, 14.75], [34.75, 37.35], [59.35, 66.2], [84.2, 86.05], [116.05, 118.8]]
    : [[6, 14.35], [34.35, 41.1], [61.1, 68.45], [88.45, 92.25]];
  let lines;
  try {
    lines = JSON.parse(await readFile(wav.replace(/\.wav$/i, '') + '.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Compatibilidade com os WAVs do rascunho, que não tinham manifesto.
    lines = speech[name].map((line, i) => ({ ...line, start: original[i][0], end: original[i][1] }));
    console.log('Sem manifesto de fala: usando os tempos do rascunho. Confira a sincronização.');
  }
  if (lines.length !== original.length || lines.some((line, i) =>
    typeof line.text !== 'string' || !Number.isFinite(line.start) || !Number.isFinite(line.end)
    || line.start < 0 || line.end <= line.start || (i > 0 && line.start < lines[i - 1].end),
  )) throw new Error('Manifesto inválido.');
  await mkdir(out, { recursive: true });
  // Uma pasta por execução evita misturar vídeos e sobrescrever evidências.
  if ((await readdir(out)).length) throw new Error('Diretório de saída deve estar vazio.');
  await mkdir(join(out, 'video'));
  outputReady = true;
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.MESA_LIVE_ACCESS_TOKEN;
  browser = await chromium.launch({ headless: true, env, args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}%noloop`, '--autoplay-policy=no-user-gesture-required',
  ] });
  context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: join(out, 'video'), size: { width: 1600, height: 900 } },
    serviceWorkers: 'block', permissions: ['microphone'],
  });
  startedAt = Date.now();
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  if (mode === 'alo-live') await recordAlo(lines);
  else await recordTriage(lines);
  await endSession();
  if (!closed) throw new Error('Encerramento não confirmado.');
}

try {
  await main();
} catch {
  // Erros do Playwright podem incluir valores de fill; nunca imprimimos o erro bruto.
  console.error('Gravação interrompida. Confira parâmetros, ambiente, servidor e o log de timing, se criado.');
  timing.log.push({ etapa: 'gravação', via: 'não determinado', resultado: 'interrompida' });
  process.exitCode = 1;
} finally {
  if (page && !closed) {
    try { await endSession(); } catch { process.exitCode = 1; }
  }
  if (page) {
    try { await saveAudio(); } catch {
      timing.log.push({ etapa: 'áudio', via: 'MediaRecorder', resultado: 'captura ausente ou incompleta' });
      process.exitCode = 1;
    }
  }
  if (context) await context.close().catch(() => { process.exitCode = 1; });
  if (browser) await browser.close().catch(() => { process.exitCode = 1; });
  if (outputReady) {
    // Somente rótulos controlados entram no log; nunca tokens, erros brutos ou transcrições.
    await writeFile(join(out, `${mode}-timing.json`), JSON.stringify(timing, null, 2) + '\n');
  }
}
