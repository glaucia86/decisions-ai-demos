#!/usr/bin/env bash
set -euo pipefail

if (( $# != 5 )); then
  echo 'Uso: bash scripts/demo-video/mix.sh <nome> <diretorio-bruto> <fala.wav> <click_ms> <rec_ms>' >&2
  exit 1
fi
name=$1
raw_dir=$2
speech=$3
click_ms=$4
rec_ms=$5
[[ "$name" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Nome inválido.' >&2; exit 1; }
[[ "$click_ms" =~ ^[0-9]+$ && "$rec_ms" =~ ^[0-9]+$ ]] || { echo 'Tempos devem ser inteiros não negativos, em ms.' >&2; exit 1; }
raw_dir=$(cd -- "$raw_dir" && pwd)
assistant="$raw_dir/$name-assistant.webm"
test -f "$assistant" && test -f "$speech" || { echo 'Áudio de fala ou do assistente ausente.' >&2; exit 1; }

# O gravador usa uma pasta exclusiva para o vídeo; exigimos um único bruto.
shopt -s nullglob
videos=("$raw_dir/video/"*.webm)
(( ${#videos[@]} == 1 )) || { echo 'Esperado exatamente um WebM em <diretorio-bruto>/video/.' >&2; exit 1; }
duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${videos[0]}")
[[ "$duration" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo 'Duração do vídeo inválida.' >&2; exit 1; }
user_delay=$((10#$click_ms + 150))
assistant_delay=$((10#$rec_ms))

ffmpeg -y -v error -i "${videos[0]}" -i "$speech" -i "$assistant" \
  -filter_complex "[1:a]adelay=${user_delay}|${user_delay},volume=0.9[u];[2:a]adelay=${assistant_delay}|${assistant_delay}[a];[u][a]amix=inputs=2:duration=longest:normalize=0,apad[m];[0:v]scale=1280:720:flags=lanczos,fps=25[v]" \
  -map '[v]' -map '[m]' -t "$duration" -c:v libx264 -crf 30 \
  -c:a aac -b:a 64k -pix_fmt yuv420p -movflags +faststart "$raw_dir/$name.mp4"

ffmpeg -y -v error -i "$raw_dir/$name.mp4" \
  -filter_complex '[0:v]setpts=(PTS-STARTPTS)/8,fps=6,scale=640:-1:flags=lanczos,split[p][q];[p]palettegen=max_colors=64[pal];[q][pal]paletteuse[v]' \
  -map '[v]' -an -loop 0 "$raw_dir/$name.gif"
printf 'MP4 e GIF gerados em %s\n' "$raw_dir"
