"""Mixes the slot clips into one file with two sections.

Usage (from the repo root; needs ffmpeg and numpy):

    python tools/mix-slot.py assets-src/slot public/assets/slot.mp3

The offsets it prints go into AUDIO.slot in src/config/system.ts.

  run   the spin: slotrunning + slotrunning2, a seamless loop, for as long
        as the reel turns
  stop  slotending, for the moment 확정 is pressed

The jackpot clips beside them are kept for later and are not used here.

Everything is levelled to a target loudness rather than left at whatever it
was recorded at: the spin plays for seconds at a time, so it sits well under
the one-shot sounds of a run (attacks and drops average about -27 to -31 dB).
"""
import json
import subprocess
import sys

import numpy as np

SR = 44100
src, out = sys.argv[1], sys.argv[2]

# Average loudness of each section, in dBFS RMS.
RUN_RMS = -34.0
STOP_RMS = -28.0


def load(name):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', f'{src}/{name}', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def seamless(x, length, fade):
    """A loop of `length` samples: x[fade:fade+length], with its last `fade`
    samples crossfaded into x[0:fade], so the end runs straight into the start."""
    body = x[fade:fade + length].copy()
    ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
    body[-fade:] = body[-fade:] * (1 - ramp) + x[:fade] * ramp
    return body


def level(x, rms_db):
    """Scaled so its RMS is `rms_db`, then held under -1 dB at the peaks."""
    rms = np.sqrt(np.mean(np.square(x))) or 1.0
    y = x * (10 ** (rms_db / 20) / rms)
    peak = np.abs(y).max()
    ceiling = 10 ** (-1 / 20)
    return y * (ceiling / peak) if peak > ceiling else y


click = load('slotrunning.mp3')    # ~2s of steady reel clicks, then a tail
click2 = load('slotrunning2.wav')  # ~3.6s of steady reel ticks

# One loop that is a whole number of both: 3.5s of the second track, and the
# first trimmed to 1.75s so it repeats exactly twice inside it.
FADE = int(0.06 * SR)
RUN = int(3.5 * SR)
c2 = seamless(click2, RUN, FADE)
c1 = seamless(click, RUN // 2, FADE)
run = level(c2 + np.tile(c1, (2, 1))[:RUN] * 0.9, RUN_RMS)

# The clunk: just its body, without the long silent tail.
ending = load('slotending.mp3')
stop = level(ending[: int(0.8 * SR)], STOP_RMS)

gap = np.zeros((int(0.3 * SR), 2), dtype=np.float32)
sections, pieces, t = [], [], 0
for name, part in (('run', run), (None, gap), ('stop', stop)):
    if name:
        sections.append({'name': name, 'start': round(t / SR, 4), 'duration': round(len(part) / SR, 4)})
    pieces.append(part)
    t += len(part)

pcm = np.concatenate(pieces).astype(np.float32)
subprocess.run(
    ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-',
     '-codec:a', 'libmp3lame', '-q:a', '4', out],
    input=pcm.tobytes(), check=True)
print(json.dumps(sections))
