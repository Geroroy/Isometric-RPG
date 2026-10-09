#!/usr/bin/env python3
"""Build the lightsaber sound set from a reference recording.

    python3 tools/saber_from_recording.py "Improved Lightsaber Sounds V1.5.m4a"

The reference is mol_eliza's "Improved Lightsaber Sounds V1.5" showcase
(Star Wars Battlefront II mod, 10:20 of gameplay). The spans below were found
by analysing it (silences = retract/ignite, arched broadband sweeps out of
silence = ignitions, valley-to-valley swells on the hum = swings, abrupt
broadband bursts with a decaying sizzle = clashes, descending chirps = blaster
bolts). Each clip is cut, high-passed, faded and loudness-matched per role;
some roles are designed from several pieces:

  hum      seamless 2 s loop (crossfaded tail into head)
  deflect  a clash transient layered over a bolt chirp
  lock     a granular loop of clash sizzle (random overlapping grains)

Output: public/audio/sfx/saber/*.wav (mono 44.1 kHz) and the saber keys of
public/audio/index.json. Needs ffmpeg, numpy, scipy.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(66)

# role -> list of (start s, end s); times in the reference recording
SPANS = {
    'ignite': [(6.03, 7.25), (10.85, 12.05), (14.45, 15.65), (18.03, 19.25), (44.56, 45.75)],
    'retract': [(9.72, 10.57), (13.56, 14.41), (42.36, 43.21), (87.97, 88.82), (120.06, 120.91), (122.56, 123.41)],
    'swing': [(27.51, 27.86), (128.40, 128.70), (137.34, 137.64), (141.37, 141.75), (145.05, 145.41), (280.93, 281.32)],
    'swingHeavy': [(142.57, 143.32), (129.17, 129.64), (138.50, 139.23), (142.09, 142.57), (211.29, 211.80), (24.55, 25.03)],
    'clash': [(197.59, 198.15), (279.46, 280.02), (205.30, 205.86), (130.52, 130.95)],
    'hit': [(25.05, 25.33), (182.15, 182.43), (415.32, 415.60)],
}
HUM = (29.2, 33.4)
BOLTS = [(36.95, 37.35), (69.05, 69.45)]
SIZZLE = [(48.10, 48.75), (52.47, 53.10), (62.88, 63.50)]

# target loudness (dBFS RMS) per role, set against the game's other effects
LEVEL = {'hum': -24, 'ignite': -17, 'retract': -20, 'swing': -21, 'swingHeavy': -19,
         'clash': -15, 'hit': -19, 'deflect': -16, 'lock': -21}


def load(src):
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / 'ref.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', str(SR), str(wav)], check=True)
        _, x = wavfile.read(wav)
    x = x.astype(np.float32) / 32768
    return signal.sosfilt(signal.butter(2, 40 / (SR / 2), 'high', output='sos'), x)


def cut(x, a, b):
    return x[int(a * SR):int(b * SR)].copy()


def fade(y, t_in=0.004, t_out=0.03):
    a, b = int(t_in * SR), int(t_out * SR)
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if b:
        y[-b:] *= np.linspace(1, 0, b) ** 2
    return y


def level(y, db):
    rms = np.sqrt(np.mean(y ** 2)) + 1e-9
    y = y * (10 ** (db / 20) / rms)
    peak = np.max(np.abs(y))
    return y * (0.95 / peak) if peak > 0.95 else y


def hum_loop(x):
    """Steady 2 s of hum whose tail crossfades into its head: no click when looping."""
    seg = cut(x, *HUM)
    n, xf = int(2.0 * SR), int(0.25 * SR)
    body = seg[:n + xf].copy()
    w = np.linspace(0, 1, xf)
    body[:xf] = body[:xf] * w + body[n:n + xf] * (1 - w)
    return body[:n]


def deflect(x, i):
    """Blaster deflection: the bright clash transient over a bolt chirp."""
    bolt = fade(cut(x, *BOLTS[i % len(BOLTS)]), 0.002, 0.08)
    a, _ = SPANS['clash'][i % len(SPANS['clash'])]
    snap = cut(x, a, a + 0.18) * np.exp(-np.arange(int(0.18 * SR)) / (0.05 * SR))
    snap = signal.sosfilt(signal.butter(2, 1500 / (SR / 2), 'high', output='sos'), snap)
    out = bolt.copy()
    out[:len(snap)] += snap * 1.4
    return fade(out, 0.001, 0.08)


def lock_loop(x, secs=2.5):
    """Saber lock: a crackling sustain from random overlapping grains of clash sizzle."""
    srcs = [cut(x, a, b) for a, b in SIZZLE]
    n = int(secs * SR)
    out = np.zeros(n + SR)
    pos = 0
    while pos < n:
        s = srcs[rng.integers(len(srcs))]
        g = int(rng.uniform(0.06, 0.14) * SR)
        o = rng.integers(0, len(s) - g)
        out[pos:pos + g] += s[o:o + g] * np.hanning(g) * rng.uniform(0.6, 1.0)
        pos += int(g * rng.uniform(0.35, 0.6))
    xf = int(0.2 * SR)  # wrap the overhang onto the head
    out[:xf] += out[n:n + xf] * np.linspace(1, 0, xf)
    return out[:n]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    x = load(sys.argv[1])
    root = Path(__file__).resolve().parent.parent
    out = root / 'public/audio/sfx/saber'
    out.mkdir(parents=True, exist_ok=True)
    bank = {}

    def write(role, name, y):
        y = level(y, LEVEL[role])
        wavfile.write(out / f'{name}.wav', SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
        bank.setdefault(role, []).append(f'sfx/saber/{name}.wav')
        print(f'  {name}.wav  {len(y) / SR:.2f}s')

    write('hum', 'hum', hum_loop(x))
    for role, spans in SPANS.items():
        for i, (a, b) in enumerate(spans, 1):
            t_in = 0.002 if role in ('ignite', 'clash', 'hit') else 0.03
            write(role, f'{role}_{i}', fade(cut(x, a, b), t_in, 0.06 if role != 'retract' else 0.02))
    for i in range(3):
        write('deflect', f'deflect_{i + 1}', deflect(x, i))
    write('lock', 'lock', lock_loop(x))

    index = root / 'public/audio/index.json'
    data = json.loads(index.read_text()) if index.exists() else {}
    sfx = data.setdefault('sfx', {})
    for k in ('buzz',):  # the synthesized layer does not belong to this set
        sfx.pop(k, None)
    sfx.update({k: (v[0] if k in ('hum', 'lock') else v) for k, v in bank.items()})
    index.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'  {index} updated')


if __name__ == '__main__':
    main()
