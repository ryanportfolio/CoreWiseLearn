"""Measure when each word starts in the sentence clips of a lines file and write the table the game reads, so the
words of a sentence light up as the voice says them.

Usage (from the repo root):
    python scripts/voice/word-onsets.py scripts/voice/lines/frog-pond-sentences.json src/games/frog-pond/read-timing.ts

Needs ffmpeg and the faster-whisper package (a speech recogniser that runs on the CPU). It is not a dependency of the
game; install it in a scratch environment, for example:
    uv venv .tmp/asr && uv pip install --python .tmp/asr/Scripts/python.exe faster-whisper
    .tmp/asr/Scripts/python.exe scripts/voice/word-onsets.py ...
The model (small.en, about 480 MB) downloads on first use into WHISPER_MODELS, or the Hugging Face cache when unset.

How a start is found, for every line whose file starts with "read-":
1. The clip is decoded with ffmpeg and its loudness measured in 10 ms steps. Runs of sound louder than -30 dB under
   the clip's peak, with gaps under 120 ms bridged, are the clip's sound islands. The postman often pauses between
   words, so most words are one island, but a word can also hold a pause ("Ca... ts") and connected words share one.
2. Whisper transcribes the clip with word timings. Its word boundaries sit somewhere in the pauses, so they are not
   used as starts directly; the end it gives a word nearly always falls inside or just after that word's sound.
3. The first word starts at the first island. Each later word starts at the island that holds (or last began before)
   the end Whisper gives it, when that island is new. When it is the previous word's island (connected speech), the
   word starts at the quietest 10 ms step within 60 ms of the start Whisper gives it.
4. The table also records where the sound ends, for the last word.

A clip whose transcript does not have the line's words in order is reported and left out of the table; the game then
lights the words at an even pace. Run this again after re-rendering any sentence clip.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

RATE, STEP = 16000, 0.01
LOUD_DB, BRIDGE, SNAP = -30.0, 0.12, 0.06


def decode(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def loudness(samples):
    step = int(RATE * STEP)
    n = (len(samples) + step - 1) // step
    padded = np.zeros(n * step, dtype=np.float32)
    padded[:len(samples)] = samples
    rms = np.sqrt(np.mean(padded.reshape(n, step) ** 2, axis=1))
    return 20 * np.log10(rms / (rms.max() + 1e-12) + 1e-12)


def islands(db):
    loud = db > LOUD_DB
    out, i, n = [], 0, len(db)
    while i < n:
        if not loud[i]:
            i += 1
            continue
        last, j = i, i
        while j < n and (loud[j] or (j - last) * STEP < BRIDGE):
            if loud[j]:
                last = j
            j += 1
        out.append((i * STEP, (last + 1) * STEP))
        i = last + 1
    return out


def norm(word):
    return re.sub(r"[^a-z]", '', word.lower())


def align(db, isl, words, heard):
    """Word starts and the end of sound, or None when the transcript does not match the words."""
    if [norm(w.word) for w in heard] != [norm(w) for w in words]:
        return None
    starts = [isl[0][0]]
    for k in range(1, len(words)):
        end = heard[k].end
        own = [s for s, e in isl if s <= end]
        start = own[-1] if own else isl[0][0]
        if start > starts[-1] + 0.06:
            starts.append(start)
            continue
        # Connected speech: the quietest step near Whisper's own start for this word.
        centre = int(round(heard[k].start / STEP))
        lo, hi = max(0, centre - int(SNAP / STEP)), min(len(db) - 1, centre + int(SNAP / STEP))
        dip = lo + int(np.argmin(db[lo:hi + 1]))
        starts.append(max(starts[-1] + 0.06, dip * STEP))
    return [round(s, 2) for s in starts] + [round(isl[-1][1], 2)]


def main():
    if len(sys.argv) != 3:
        sys.exit('Usage: python scripts/voice/word-onsets.py <lines-file> <out.ts>')
    from faster_whisper import WhisperModel
    lines_path, out_path = sys.argv[1], sys.argv[2]
    with open(lines_path, encoding='utf-8') as f:
        lines = json.load(f)
    folder = os.path.join('public', 'voice', lines['folder'])
    model = WhisperModel('small.en', device='cpu', compute_type='int8', download_root=os.environ.get('WHISPER_MODELS'))
    table, failed = {}, []
    for line in lines['lines']:
        if not line['file'].startswith('read-'):
            continue
        path = os.path.join(folder, line['file'] + '.mp3')
        if not os.path.exists(path):
            print(f"missing {path}, skipped")
            continue
        words = re.sub(r'[.?!,]', '', line['text']).split()
        samples = decode(path)
        db = loudness(samples)
        segments, _ = model.transcribe(samples, language='en', word_timestamps=True, beam_size=5, initial_prompt=line['text'])
        heard = [w for s in segments for w in s.words]
        timing = align(db, islands(db), words, heard)
        if timing is None:
            failed.append(f"{line['file']}: heard {' '.join(w.word.strip() for w in heard)!r}")
            continue
        table[line['file']] = timing
        print(f"{line['file']:<38} " + ' '.join(f'{w}@{t:.2f}' for w, t in zip(words, timing)) + f' end {timing[-1]:.2f}')
    body = '\n'.join(f"  '{k}': [{', '.join(str(x) for x in v)}]," for k, v in table.items())
    src = lines_path.replace('\\', '/')
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(f"""/**
 * When each word starts in the postman's sentence clips, in seconds from the clip's start, then where the sound ends.
 * Generated by scripts/voice/word-onsets.py from {src}; run it again after re-rendering a sentence clip rather than
 * editing this by hand. A clip missing here lights its words at an even pace.
 */
export const READ_TIMING: Readonly<Record<string, readonly number[]>> = {{
{body}
}};
""")
    print(f"\n{len(table)} clips timed" + (f"; {len(failed)} left out:\n  " + '\n  '.join(failed) if failed else ''))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
