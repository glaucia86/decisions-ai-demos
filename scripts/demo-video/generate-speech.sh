#!/usr/bin/env bash
set -euo pipefail

# Nunca habilite set -x: a chave só sai pelo stdin do curl, como header.
test -n "${OPENAI_API_KEY:-}" || { echo 'Exporte OPENAI_API_KEY no ambiente.' >&2; exit 1; }
if (( $# != 1 )); then
  echo 'Uso: bash scripts/demo-video/generate-speech.sh <saida>' >&2
  exit 1
fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node --input-type=module - "$script_dir/speech.json" "$1" <<'NODE'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const [source, destination] = process.argv.slice(2);
const key = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.MESA_LIVE_ACCESS_TOKEN;

// O header não entra em argv, arquivo, stdout ou stderr. Não herdamos curlrc.
function run(command, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => reject(new Error(`Não foi possível executar ${command}.`)));
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} falhou; geração interrompida.`)));
    child.stdin.end(input);
  });
}

let temporary;
try {
  if (!key || /[\r\n]/.test(key)) throw new Error('OPENAI_API_KEY ausente ou inválida.');
  const speech = JSON.parse(await readFile(source, 'utf8'));
  const out = resolve(destination);
  await mkdir(out, { recursive: true });
  temporary = await mkdtemp(join(tmpdir(), 'demo-speech-'));
  for (const name of ['alo', 'triagem']) {
    const parts = [];
    const timings = [];
    let elapsed = 0;
    async function silence(seconds = 0) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Silêncio inválido em speech.json.');
      if (!seconds) return;
      const file = `part-${parts.length}.wav`;
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(seconds), '-c:a', 'pcm_s16le', join(temporary, file)]);
      parts.push(file);
      elapsed += seconds;
    }
    for (const [index, line] of speech[name].entries()) {
      await silence(line.silence_before_s);
      const request = join(temporary, 'request.json');
      const raw = join(temporary, 'response.wav');
      await writeFile(request, JSON.stringify({
        model: speech.model, voice: speech.voice, input: line.text,
        instructions: speech[`instructions_${name}`], response_format: 'wav',
      }));
      await run('curl', ['--disable', '--silent', '--show-error', '--fail',
        '--connect-timeout', '30', '--max-time', '180',
        '--request', 'POST', 'https://api.openai.com/v1/audio/speech',
        '-H', '@-', '-H', 'Content-Type: application/json',
        '--data-binary', `@${request}`, '--output', raw,
      ], `Authorization: Bearer ${key}\n`);
      const file = `part-${parts.length}.wav`;
      await run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', join(temporary, file)]);
      const duration = Number(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', join(temporary, file)]));
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duração inválida do TTS.');
      timings.push({ id: line.id, text: line.text, start: elapsed, end: elapsed + duration });
      elapsed += duration;
      parts.push(file);
      await silence(line.silence_after_s);
      console.log(`${name}: fala ${index + 1} gerada.`);
    }
    const list = join(temporary, 'concat.txt');
    await writeFile(list, parts.map(file => `file '${file}'`).join('\n') + '\n');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '1', '-i', list,
      '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', join(out, `${name}-speech.wav`)]);
    await writeFile(join(out, `${name}-speech.json`), JSON.stringify(timings, null, 2) + '\n');
  }
} catch {
  // Não repassamos respostas da API nem diagnósticos que possam conter segredos.
  console.error('Falha ao gerar falas. Confira as dependências, speech.json, acesso à API e diretório de saída.');
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
NODE
