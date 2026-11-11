#!/usr/bin/env bash
# potatoHQ end-to-end smoke test. Everything it writes stays inside potatoHQ/work.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN=./build/potatohq
WORK=work
mkdir -p "$WORK"

echo "== build =="
make -s app tests

echo "== unit tests =="
./build/phq_tests | tee "$WORK/test-output.txt"

echo "== devices =="
$BIN devices | tee "$WORK/devices.json"

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  if [[ -f work/sample10.flac ]]; then
    SRC=work/sample10.flac
  else
    echo "no source file; pass one as \$1 (e.g. a FLAC from PotatoLibrary)" >&2
    exit 1
  fi
fi

echo "== info ($SRC) =="
$BIN info "$SRC" | tee "$WORK/info.json"

echo "== convert 44.1k -> 705.6k/24 =="
$BIN convert --in "$SRC" --out "$WORK/smoke_705k.wav" --rate 705600 --bits 24 --taps 128

echo "== convert 44.1k -> DSD64 =="
$BIN dsd --in "$SRC" --out "$WORK/smoke_dsd64.dsf" --dsd 64 --order 7 --taps 64

echo "== DoP64 carrier =="
$BIN dop --in "$SRC" --out "$WORK/smoke_dop64.wav" --dsd 64 --order 7
python3 tools/check_dop.py "$WORK/smoke_dop64.wav" | tee "$WORK/dop-check.txt"

echo "== probe outputs =="
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,duration -of json "$WORK/smoke_705k.wav" | tee "$WORK/probe_wav.json"
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of json "$WORK/smoke_dsd64.dsf" | tee "$WORK/probe_dsf.json"
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,bits_per_sample -of json "$WORK/smoke_dop64.wav" | tee "$WORK/probe_dop.json"

echo "== rpc =="
printf '%s\n' \
  '{"id":1,"method":"engine.capabilities"}' \
  '{"id":2,"method":"engine.setOutput","params":{"deviceId":"","exclusive":true}}' \
  '{"id":3,"method":"playback.state"}' \
  '{"id":4,"method":"engine.shutdown"}' \
  | $BIN rpc | tee "$WORK/rpc-session.jsonl"

echo "== done =="
