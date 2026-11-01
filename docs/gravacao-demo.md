# Gravação das demos

Os vídeos de 01/11/2026 estão em [Alô, TI](media/alo-ti-demo.mp4) e
[Triagem](media/triagem-demo.mp4), com prévias em [GIF do Alô, TI](media/alo-ti-demo.gif)
e [GIF da Triagem](media/triagem-demo.gif).

O microfone é **virtual** e as falas do usuário são **sintetizadas por TTS da OpenAI**;
não é uma pessoa falando. O Chromium headless recebe um WAV como microfone, e o
áudio do assistente é capturado dentro da página com `MediaRecorder` sobre o
`srcObject` do `<audio>`. O ffmpeg mistura as duas fontes com o vídeo do Playwright.

O trecho **MODO REAL** mostra respostas reais de GPT-Live e Decisions, que podem
variar entre execuções. O Alô, TI começa com uma introdução **MODO SIMULADO**, com
fixtures e sem API, antes de entrar no modo real. Os tickets e os dados de
monitoramento continuam sendo de demonstração. O roteiro automatiza também as
ações de revisão na interface; a gravação demonstra esse fluxo.

Há custo de API para **sessão GPT-Live + TTS + Decisions**. O servidor impõe um
limite local de **3 inícios em 10 minutos** e uma sessão por vez; esse limite não
é um teto financeiro. Aguarde o encerramento confirmado antes da próxima gravação.
Os vídeos não contêm a chave OpenAI nem o código de acesso local em texto aberto:
o código aparece **mascarado no campo de senha**. A chave fica no ambiente do
servidor e do gerador de falas, nunca é preenchida na página.

## 1. Preparar as dependências

Execute na raiz do repositório, em Bash, com **Node 24.21.0**, versão recomendada
por `.nvmrc` e compatível com `engines` do `package.json`. Instale também `curl`,
`ffmpeg` e `ffprobe`; o ffmpeg precisa incluir o encoder `libx264`.

```bash
node --version
ffmpeg -version
ffprobe -version
npm ci
npx playwright install chromium
```

Instalação de dependências, download do Chromium, TTS e sessões reais precisam de
rede. As verificações de sintaxe ao final deste guia são locais e não usam a API.

## 2. Configurar o ambiente e iniciar a aplicação

No mesmo Bash que será usado para iniciar o servidor e os scripts, exporte os
segredos sem colocá-los em comandos literais ou no histórico. Não habilite
`set -x`, `DEBUG`, `PWDEBUG` ou tracing do Playwright durante a gravação.

```bash
export MESA_LIVE_ENABLED=true
export MESA_LIVE_ACCESS_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
read -r -s -p 'OPENAI_API_KEY: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
test -n "$OPENAI_API_KEY"

export DEMO_BASE_URL=http://127.0.0.1:3000
demo_assets=$(mktemp -d "${TMPDIR:-/tmp}/decisions-demo.XXXXXX")
export DEMO_ASSETS="$demo_assets"

npm run build && npm start &
```

O código local é aleatório, gerado localmente, com mais de 32 caracteres, e é
distinto da chave da API. A cadeia `npm run build && npm start` fica em segundo
plano para preservar o mesmo ambiente nos comandos seguintes. Aguarde a mensagem
de servidor pronto antes de continuar; se o build falhar, resolva o erro antes de
gravar. Mantenha o servidor em loopback, no endereço de `DEMO_BASE_URL`.

Não versione arquivos `.env`. Este procedimento usa apenas variáveis exportadas.
Se optar por `.env.local`, ele já está no `.gitignore`: apague-o depois do uso, sem
apagar configurações preexistentes de outra tarefa. Os scripts não carregam esse
arquivo; `OPENAI_API_KEY` e `MESA_LIVE_ACCESS_TOKEN` ainda precisam estar exportadas
nos processos correspondentes. Não imprima os valores para copiá-los entre terminais.

## 3. Gerar as falas

```bash
bash scripts/demo-video/generate-speech.sh "$DEMO_ASSETS"
```

O script lê [speech.json](../scripts/demo-video/speech.json), usa o modelo, a voz,
as instruções e os textos definidos nele e faz um POST por fala para
`https://api.openai.com/v1/audio/speech`, com `response_format: wav`. A chave é lida
somente de `OPENAI_API_KEY` e enviada no header pelo stdin do `curl` (`-H @-`), sem
arquivo de credencial ou chave nos argumentos do processo. O script desabilita a
configuração automática do curl e não imprime respostas de erro da API.

Cada fala é convertida para **48 kHz, mono, PCM s16le**, recebe os silêncios
`silence_before_s` e `silence_after_s` e é concatenada na ordem do JSON. São gerados:

- `alo-speech.wav` e `triagem-speech.wav`;
- `alo-speech.json` e `triagem-speech.json`, com início e fim de cada fala em segundos.

Mantenha cada manifesto JSON ao lado do WAV correspondente. Ele permite ao
gravador acompanhar a duração efetiva do TTS, que pode variar. Para um WAV antigo
sem manifesto, o gravador avisa e usa os tempos do rascunho original; confira a
sincronização antes de publicar. Para um WAV diferente, forneça o manifesto
correspondente com entradas `{ "id", "text", "start", "end" }`, na ordem das falas.

## 4. Gravar

```bash
node scripts/demo-video/record.mjs alo-live \
  "$DEMO_ASSETS/raw/alo-live" "$DEMO_ASSETS/alo-speech.wav"

node scripts/demo-video/record.mjs triagem-real \
  "$DEMO_ASSETS/raw/triagem-real" "$DEMO_ASSETS/triagem-speech.wav"
```

Execute uma gravação por vez e só prossiga se a anterior terminar com sucesso.
Cada diretório de saída deve estar vazio ou ainda não existir. Para repetir,
escolha outro diretório e respeite o limite local de sessões.

| Configuração | Argumento ou variável | Padrão |
| --- | --- | --- |
| Modo | Primeiro argumento ou `DEMO_MODE` | Obrigatório: `alo-live` ou `triagem-real` |
| Diretório de saída | Segundo argumento ou `DEMO_OUTPUT_DIR` | `demo-output`, relativo ao diretório atual |
| WAV do microfone | Terceiro argumento ou `DEMO_SPEECH_WAV` | Obrigatório |
| URL da aplicação | `DEMO_BASE_URL` | `http://127.0.0.1:3000` |
| Código de acesso local | `MESA_LIVE_ACCESS_TOKEN` | Obrigatório, somente pelo ambiente |

Os argumentos prevalecem sobre as variáveis correspondentes. Não existe modo
separado `alo-sim`: a introdução simulada faz parte de `alo-live`.

O Chromium usa `--use-fake-ui-for-media-stream`,
`--use-fake-device-for-media-stream` e
`--use-file-for-fake-audio-capture=<wav>%noloop`. Tanto o viewport quanto o vídeo
bruto são **1600×900**. Ao terminar, cada diretório contém:

- `video/<identificador-do-playwright>.webm`: vídeo bruto, sem a mixagem final;
- `<modo>-assistant.webm`: áudio recebido do assistente;
- `<modo>-timing.json`: `click`, `rec` e `log`.

`click` e `rec` são offsets em milissegundos relativos ao instante imediatamente
anterior à criação da página: respectivamente, a tentativa de clicar para iniciar
a sessão e o início do `MediaRecorder`. Essa referência aproxima o início do
vídeo do Playwright; confira a sincronização no MP4 final. O acréscimo de 150 ms
na fala do usuário é aplicado apenas pela mixagem.

O `log` registra etapa, caminho e resultado observado. No Alô, TI, o gravador
consulta os comandos marcados como “feito” na interface; sem comando observado,
usa o campo de texto para registrar/corrigir, **Analisar com Decisions** para
analisar ou **Confirmar** (rótulo completo: “Confirmar ticket simulado ao vivo”)
para confirmar, quando o botão está habilitado. Na Triagem, usa **Classificar
agora** quando ainda não há cartão e o botão está habilitado. As legendas avisam
quando um fallback é usado.

Na Triagem, a atribuição é observacional: cartão sem clique de fallback é
registrado como voz (“Registra”); com clique, o log informa o botão. Isso não
prova causalidade se uma delegação chegar simultaneamente ao clique. O JSON
registra tentativas e resultados separadamente, inclusive ausência de resultado,
sem transcrições, segredos ou mensagens de erro brutas. O WAV não pausa: se o
roteiro perder a janela de uma fala ou não confirmar um cartão antes da próxima,
interrompe a gravação para evitar atribuir a fala errada à etapa.

Em caso de falha, o gravador tenta encerrar a sessão e preservar áudio, vídeo e
timing parcial. `click` ou `rec` podem ficar `null`, e o áudio pode faltar: não
mixe esses artefatos como se fossem uma execução concluída. Confira o encerramento
na aplicação antes de tentar novamente.

## 5. Mixar e gerar as prévias

Depois de conferir o `log`, extraia os offsets de cada execução e misture:

```bash
for mode in alo-live triagem-real; do
  raw="$DEMO_ASSETS/raw/$mode"
  case "$mode" in
    alo-live) speech="$DEMO_ASSETS/alo-speech.wav" ;;
    triagem-real) speech="$DEMO_ASSETS/triagem-speech.wav" ;;
  esac
  offsets=$(node --input-type=module - "$raw/$mode-timing.json" <<'NODE'
import { readFileSync } from 'node:fs';
const { click, rec } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (![click, rec].every(value => Number.isInteger(value) && value >= 0)) {
  throw new Error('Timing incompleto; não mixar.');
}
console.log(click, rec);
NODE
  ) || break
  read -r click_ms rec_ms <<< "$offsets"
  bash scripts/demo-video/mix.sh "$mode" "$raw" "$speech" "$click_ms" "$rec_ms" || break
done
```

`mix.sh <nome> <diretorio-bruto> <fala.wav> <click_ms> <rec_ms>` procura exatamente
um vídeo em `<diretorio-bruto>/video/` e o áudio
`<diretorio-bruto>/<nome>-assistant.webm`. Gera `<nome>.mp4` e `<nome>.gif` no próprio
diretório bruto; arquivos finais com esses nomes são sobrescritos numa nova mixagem.

O MP4 usa H.264, CRF 30, AAC 64k, 1280×720, 25 fps e `faststart`, com `-t` igual à
duração do vídeo bruto. Para `U = click_ms + 150` e `R = rec_ms`, o filtro é:

```text
[1:a]adelay=U|U,volume=0.9[u];[2:a]adelay=R|R[a];[u][a]amix=inputs=2:duration=longest:normalize=0,apad[m];[0:v]scale=1280:720:flags=lanczos,fps=25[v]
```

O GIF não tem áudio: é uma prévia **8× mais rápida, 6 fps, 640 px de largura e
paleta de 64 cores**. Revise os MP4s com áudio antes de copiar ou renomear os
resultados para `docs/media/alo-ti-demo.mp4`, `triagem-demo.mp4` e seus GIFs.

Ao concluir, traga o servidor ao primeiro plano com `fg` e encerre com `Ctrl+C`.
Depois, remova as variáveis de segredo desta sessão:

```bash
unset OPENAI_API_KEY MESA_LIVE_ACCESS_TOKEN MESA_LIVE_ENABLED
```

Se criou `.env.local` só para esta gravação, apague-o também.

## Caminhos usados na gravação de 01/11/2026

Esta tabela descreve a gravação existente, não promete os mesmos caminhos em
execuções futuras. Consulte o timing de cada nova gravação.

| Demo | Etapa | Caminho usado |
| --- | --- | --- |
| Alô, TI | Registrar | Voz |
| Alô, TI | Analisar 1 | Voz |
| Alô, TI | Corrigir | Voz |
| Alô, TI | Analisar 2 | Botão “Analisar com Decisions” |
| Alô, TI | Confirmar | Voz |
| Triagem | Fala 1 | Botão “Classificar agora” |
| Triagem | Fala 2 | Voz (“Registra”) |
| Triagem | Fala 3 | Voz (“Registra”) |
| Triagem | Fala 4 | Voz (“Registra”) |

## Validar a sintaxe sem rede nem chave

```bash
node --check scripts/demo-video/record.mjs
bash -n scripts/demo-video/generate-speech.sh
bash -n scripts/demo-video/mix.sh
```

Esses comandos verificam a sintaxe dos arquivos, sem executar gravação, TTS ou
mixagem. Não substituem uma revisão audiovisual da execução real.
