"""Mixes the five slot clips into one file with three sections.

Usage (from the repo root; needs ffmpeg and numpy):

    python tools/mix-slot.py assets-src/slot public/assets/slot.mp3

The offsets it prints go into AUDIO.slot in src/config/system.ts.

  [0, RUN)            spin loop: jackpotrunning bed + slotrunning2 + slotrunning, seamless
  [RUN+GAP, +STOP)    slotending, for the moment 확정 is pressed
  [.., +WIN)          jackpothighlight, for the landing

Prints the section offsets so the game's markers can be written from them.
"""
import subprocess, sys, json
import numpy as np

SR = 44100
src, out = sys.argv[1], sys.argv[2]

def load(name):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', f'{src}/{name}', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

def db(x, gain):
    return x * (10 ** (gain / 20))

def seamless(x, length, fade):
    """A loop of `length` samples: x[fade:fade+length], with its last `fade`
    samples crossfaded into x[0:fade], so the end runs straight into the start."""
    body = x[fade:fade + length].copy()
    head = x[:fade]
    ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
    body[-fade:] = body[-fade:] * (1 - ramp) + head * ramp
    return body

def tile(x, length):
    reps = int(np.ceil(length / len(x))) + 1
    return np.tile(x, (reps, 1))[:length]

bed = load('jackpotrunning.wav')      # ~7.2s of music, then a fade tail
click = load('slotrunning.mp3')       # ~2.0s of reel clicks, tail after
click2 = load('slotrunning2.wav')     # ~3.6s of reel ticks
ending = load('slotending.mp3')
win = load('jackpothighlight.wav')

FADE = int(0.25 * SR)
RUN = int(6.6 * SR)                   # inside the bed, before its fade-out

loop = db(seamless(bed, RUN, FADE), -7)
# The click tracks are loops of their own: trim each to its steady part,
# make it seamless, then repeat it across the bed.
c1 = seamless(click, int(1.9 * SR) - FADE // 4, FADE // 4)
c2 = seamless(click2, int(3.5 * SR) - FADE // 4, FADE // 4)
loop = loop + db(tile(c1, RUN), -3) + db(tile(c2, RUN), -4)

# Soft-limit the sum so layering cannot clip.
peak = np.abs(loop).max()
if peak > 0.89:
    loop *= 0.89 / peak

GAP = np.zeros((int(0.3 * SR), 2), dtype=np.float32)
stop = ending.copy()
winp = db(win, 4)
for part in (stop, winp):
    p = np.abs(part).max()
    if p > 0.95:
        part *= 0.95 / p

sections = []
pieces = []
t = 0
for name, part in (('run', loop), ('gap', GAP), ('stop', stop), ('gap', GAP), ('win', winp)):
    if name != 'gap':
        sections.append({'name': name, 'start': round(t / SR, 4), 'duration': round(len(part) / SR, 4)})
    pieces.append(part)
    t += len(part)

pcm = np.concatenate(pieces).astype(np.float32)
subprocess.run(
    ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-',
     '-codec:a', 'libmp3lame', '-q:a', '4', out],
    input=pcm.tobytes(), check=True)
print(json.dumps(sections))
