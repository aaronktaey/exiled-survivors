"""Cuts the 키메라's three sounds out of one hydra recording, each changed
its own way, and levels them beside the rest of a run's one-shot sounds.

Usage (from the repo root; needs ffmpeg and numpy):

    python tools/make-chimera-sfx.py assets-src/chimera/hydra.mp3 public/assets

The source is a pack of nineteen roars with silence between them; the
times below are where the ones used start and end.

  chimeraAppear.mp3   the long roar at 32.3s, a fifth lower and slower,
                      in a cave (two echoes) — heard as one walks in
  chimeraDeath.mp3    the roar at 17.2s that dies away, slowed to 0.7,
                      darkened (low-pass) and left to ring out
  chimeraCast1/2.mp3  the short snarls at 0.9s and 8.8s, a third higher
                      and quicker, thinned (high-pass) and cut short —
                      the ring of thorns going out

Levels are average loudness (dBFS RMS). A 키메라 can be on screen by the
dozen at the end of a run, so they sit under the 우두머리's horn (about
-20) and the casts under the swings (about -27).
"""
import subprocess
import sys

import numpy as np

SR = 44100
src, out = sys.argv[1], sys.argv[2]

CLIPS = {
    'chimeraAppear': dict(start=32.29, end=35.08, rate=0.82, rms=-26.0, fade=0.8,
                          extra='bass=g=4,aecho=0.8:0.7:90|170:0.35|0.22'),
    'chimeraDeath': dict(start=17.15, end=20.45, rate=0.70, rms=-26.0, fade=1.6,
                         extra='lowpass=f=2400,aecho=0.8:0.8:120|260:0.3|0.18'),
    'chimeraCast1': dict(start=0.90, end=2.04, rate=1.28, rms=-29.0, fade=0.25, keep=0.75,
                         extra='highpass=f=320'),
    'chimeraCast2': dict(start=8.81, end=10.19, rate=1.28, rms=-29.0, fade=0.25, keep=0.75,
                         extra='highpass=f=320'),
}


def render(clip):
    """The cut, re-pitched (rate changes pitch and speed together) and filtered."""
    chain = f"asetrate={int(SR * clip['rate'])},aresample={SR},{clip['extra']}"
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-ss', str(clip['start']), '-to', str(clip['end']), '-i', src,
         '-af', chain, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
        check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
    if 'keep' in clip:
        x = x[:int(clip['keep'] * SR)]
    fade = min(len(x), int(clip['fade'] * SR))
    x[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
    attack = int(0.004 * SR)
    x[:attack] *= np.linspace(0, 1, attack, dtype=np.float32)[:, None]
    return x


def level(x, rms_db):
    """Scaled so its RMS is `rms_db`, then held under -1 dB at the peaks."""
    rms = np.sqrt(np.mean(x ** 2))
    x = x * (10 ** (rms_db / 20) / max(rms, 1e-9))
    peak = np.abs(x).max()
    ceiling = 10 ** (-1 / 20)
    return x * (ceiling / peak) if peak > ceiling else x


for name, clip in CLIPS.items():
    x = level(render(clip), clip['rms'])
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-',
         '-b:a', '96k', f'{out}/{name}.mp3'],
        input=x.astype(np.float32).tobytes(), check=True)
    final = 20 * np.log10(np.sqrt(np.mean(x ** 2)))
    print(f'{name}.mp3  {len(x) / SR:.2f}s  {final:.1f} dB RMS')
