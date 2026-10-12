#!/usr/bin/env python3
"""Ambience loops for the Coruscant city hub, synthesized from scratch
(numpy + scipy; no recordings, no samples, an original tune).

    python3 tools/city_ambience.py        # writes public/audio/amb/*.webm

Each loop is seamless (its tail crossfades into its head). The game
(src/core/ambience.js) layers them by where Anakin is:

  hum        the undercity's bed: a low machine drone, far rumbles, drips
  wind       the upper plaza's bed: high air moving between the towers
  traffic    distant speeders: swells of filtered noise sweeping past, far horns
  murmur     a crowd of alien voices: formant-filtered syllables, no words
  cantina    a small cantina band, an original swing tune in D minor
             (reed lead, walking bass, keys, brushes) — heard through the
             cantina's walls, louder and clearer nearer its door
  steam      a vent's hiss, breathing
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 32000
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'public' / 'audio' / 'amb')
rng = np.random.default_rng(1138)


def noise(n):
    return rng.standard_normal(n)


def brown(n):
    b = np.cumsum(noise(n))
    b = signal.lfilter([1], [1, -0.995], noise(n))
    return b / np.max(np.abs(b))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='high', fs=SR, output='sos'), x)


def env(n, a, d):
    """Attack / exponential decay envelope over n samples (seconds)."""
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))


def loop(x, xf=1.5):
    """Make x seamless: its last xf seconds fade into its start."""
    c = int(xf * SR)
    body = x[:-c].copy()
    w = np.linspace(0, 1, c)[:, None] if x.ndim == 2 else np.linspace(0, 1, c)
    body[:c] = body[:c] * w + x[-c:] * (1 - w)
    return body


def norm(x, peak=0.8):
    return x * (peak / (np.max(np.abs(x)) + 1e-9))


def stereo(l, r):
    return np.stack([l, r], axis=1)


def write(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / f'{name}.wav'
    wavfile.write(wav, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    webm = OUT / f'{name}.webm'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'libopus', '-b:a', '56k', str(webm)], check=True)
    wav.unlink()
    print('wrote', webm, f'{len(x) / SR:.1f}s')


def hum(sec=24):
    n = int((sec + 1.5) * SR)
    t = np.arange(n) / SR
    # a machine drone: two close low tones beating, with a slow swell
    d = sum(a * np.sin(2 * np.pi * f * t + rng.random() * 6) for f, a in ((48, 0.5), (48.7, 0.4), (96.3, 0.15), (143, 0.06)))
    d *= 0.75 + 0.25 * np.sin(2 * np.pi * t / 7.3)
    rumble = lp(brown(n), 160) * 0.9
    air = bp(noise(n), 300, 1400) * 0.05 * (0.6 + 0.4 * np.sin(2 * np.pi * t / 11))
    x = d * 0.35 + rumble + air
    # drips: short pitched pings at random, some echoing
    for _ in range(int(sec * 1.4)):
        i = int(rng.random() * (n - SR))
        f0 = rng.uniform(900, 2400)
        m = int(0.12 * SR)
        tt = np.arange(m) / SR
        ping = np.sin(2 * np.pi * (f0 * tt - 2500 * tt * tt)) * env(m, 0.001, 0.03)
        x[i:i + m] += ping * rng.uniform(0.04, 0.12)
        e = i + int(0.18 * SR)
        x[e:e + m] += ping * 0.03
    x = norm(x, 0.7)
    return loop(stereo(x, np.roll(x, 400)))


def wind(sec=24):
    n = int((sec + 1.5) * SR)
    t = np.arange(n) / SR
    g = 0.5 + 0.5 * np.sin(2 * np.pi * t / 9) * np.sin(2 * np.pi * t / 5.3 + 1)
    l = bp(noise(n), 250, 1800) * (0.4 + 0.6 * g) + lp(brown(n), 200) * 0.4
    r = bp(noise(n), 250, 1800) * (0.4 + 0.6 * np.roll(g, SR)) + lp(brown(n), 200) * 0.4
    whine = np.sin(2 * np.pi * (620 + 30 * np.sin(2 * np.pi * t / 13)) * t) * 0.012
    return loop(stereo(norm(l + whine, 0.6), norm(r + whine, 0.6)))


def traffic(sec=30):
    n = int((sec + 1.5) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for _ in range(int(sec * 0.8)):
        dur = rng.uniform(1.6, 3.6)
        m = int(dur * SR)
        i = int(rng.random() * (n - m))
        tt = np.linspace(0, 1, m)
        # a pass: a swell whose filter sweeps down (Doppler) while it pans across
        src = noise(m)
        f = np.linspace(rng.uniform(900, 1500), rng.uniform(300, 600), m)
        out = np.zeros(m)
        for k in range(0, m, 512):  # time-varying band-pass, block by block
            seg = src[k:k + 512]
            fc = f[k]
            b, a = signal.iirpeak(fc, 1.6, fs=SR)
            out[k:k + 512] = signal.lfilter(b, a, seg)
        swell = np.sin(np.pi * tt) ** 2 * rng.uniform(0.3, 1)
        pan = tt if rng.random() < 0.5 else 1 - tt
        # an engine tone riding on it
        tone = np.sin(2 * np.pi * np.cumsum(f * 0.12) / SR) * 0.15
        s = (out + tone) * swell
        L[i:i + m] += s * np.cos(pan * np.pi / 2)
        R[i:i + m] += s * np.sin(pan * np.pi / 2)
    # a far horn now and then
    for _ in range(3):
        m = int(0.6 * SR)
        i = int(rng.random() * (n - m))
        tt = np.arange(m) / SR
        h = (np.sin(2 * np.pi * 330 * tt) + 0.5 * np.sin(2 * np.pi * 415 * tt)) * env(m, 0.05, 0.3) * 0.08
        L[i:i + m] += lp(h, 1200)
        R[i:i + m] += lp(h, 1200) * 0.7
    bed = lp(brown(n), 300) * 0.15
    return loop(stereo(norm(L + bed, 0.6), norm(R + bed, 0.6)))


FORMANTS = [(800, 1200), (400, 2000), (300, 900), (600, 1700), (350, 2500), (500, 1000), (700, 1500)]


def voice_syllables(n, pitch, rate):
    """One alien voice: syllables of a buzzy source through formant pairs, no words."""
    out = np.zeros(n)
    i = int(rng.random() * SR)
    while i < n - SR:
        k = int(rng.uniform(3, 9))  # a phrase of k syllables, then a pause
        for _ in range(k):
            m = int(rng.uniform(0.09, 0.22) / rate * SR)
            if i + m >= n:
                break
            tt = np.arange(m) / SR
            f0 = pitch * (1 + 0.15 * np.sin(np.pi * tt / tt[-1]) * rng.uniform(-1, 1))
            src = signal.sawtooth(2 * np.pi * np.cumsum(f0) / SR) * 0.6 + noise(m) * 0.2
            f1, f2 = FORMANTS[int(rng.random() * len(FORMANTS))]
            b1, a1 = signal.iirpeak(f1 * rng.uniform(0.85, 1.15), 4, fs=SR)
            b2, a2 = signal.iirpeak(f2 * rng.uniform(0.85, 1.15), 5, fs=SR)
            s = signal.lfilter(b1, a1, src) + 0.6 * signal.lfilter(b2, a2, src)
            out[i:i + m] += s * np.clip(np.sin(np.pi * tt / max(tt[-1], 1e-3)), 0, 1) ** 0.7
            i += m + int(rng.uniform(0.0, 0.05) * SR)
        i += int(rng.uniform(0.6, 2.5) * SR)
    return out


def murmur(sec=24):
    n = int((sec + 1.5) * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for v in range(14):
        x = voice_syllables(n, rng.uniform(80, 260), rng.uniform(0.8, 1.3)) * rng.uniform(0.3, 1)
        p = rng.random()
        L += x * np.cos(p * np.pi / 2)
        R += x * np.sin(p * np.pi / 2)
    # a room: blur it, take the edge off (far-off talk)
    L = lp(L, 2600)
    R = lp(R, 2600)
    bed = bp(noise(n), 200, 900) * 0.08
    return loop(stereo(norm(L + bed, 0.55), norm(R + bed, 0.55)))


def steam(sec=6):
    n = int((sec + 1.0) * SR)
    t = np.arange(n) / SR
    breath = 0.55 + 0.45 * np.sin(2 * np.pi * t / 3.0) ** 2
    x = hp(noise(n), 2500) * 0.7 + bp(noise(n), 600, 2400) * 0.3
    x = x * breath
    return loop(stereo(norm(x, 0.5), norm(np.roll(x, 300), 0.5)), 1.0)


# ------------------------------------------------------------------ the cantina band
BPM = 132
BEAT = 60 / BPM
SWING = 0.62  # the off-beat eighth lands this far into the beat


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


def beat_time(b):
    """Swung time of a position in beats."""
    whole = np.floor(b)
    frac = b - whole
    return (whole + np.where(frac < 0.5, frac / 0.5 * SWING, SWING + (frac - 0.5) / 0.5 * (1 - SWING))) * BEAT


def reed(f, dur, vel):
    m = int(dur * SR)
    tt = np.arange(m) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * tt) * np.minimum(1, tt / 0.25)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = sum(np.sin(k * ph) / k ** 1.1 for k in (1, 3, 5, 7, 9)) + 0.3 * np.sin(2 * ph)
    e = np.minimum(1, tt / 0.03) * np.minimum(1, (dur - tt) / 0.05) * (1 - 0.25 * tt / dur)
    return lp(x * e * vel, 3200)


def pluck_bass(f, dur, vel):
    m = int(dur * SR)
    tt = np.arange(m) / SR
    x = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.1 * signal.sawtooth(2 * np.pi * f * tt)
    return lp(x * env(m, 0.005, 0.35) * vel, 900)


def keys(fs, dur, vel):
    m = int(dur * SR)
    tt = np.arange(m) / SR
    x = sum(signal.sawtooth(2 * np.pi * f * d * tt) for f in fs for d in (1, 1.004))
    return lp(x * env(m, 0.004, 0.18) * vel * 0.08, 1800)


def cantina():
    # an original 16-bar tune: D minor swing, i – iv – V – i shapes
    chords = ['Dm', 'Dm', 'Gm', 'A7', 'Dm', 'Bb7', 'A7', 'Dm',
              'Gm', 'Dm', 'E7', 'A7', 'Dm', 'Gm', 'A7', 'Dm']
    ROOT = {'Dm': 50, 'Gm': 55, 'A7': 45, 'Bb7': 46, 'E7': 52}
    TONES = {'Dm': [0, 3, 7, 10], 'Gm': [0, 3, 7, 10], 'A7': [0, 4, 7, 10], 'Bb7': [0, 4, 7, 10], 'E7': [0, 4, 7, 10]}
    # the melody: (beat, length in beats, midi) — written for this game
    mel = [
        (0, .5, 69), (.5, .5, 72), (1, .5, 74), (1.5, .5, 72), (2, 1, 69), (3, .5, 67), (3.5, .5, 65),
        (4, .5, 64), (4.5, .5, 65), (5, 1, 69), (6, 1.5, 62), (8, .5, 70), (8.5, .5, 69), (9, .5, 67), (9.5, .5, 70),
        (10, 1, 69), (11, .5, 67), (11.5, .5, 64), (12, .5, 61), (12.5, .5, 64), (13, .5, 67), (13.5, .5, 70), (14, 2, 69),
        (16, .5, 74), (16.5, .5, 72), (17, .5, 74), (17.5, .5, 77), (18, 1, 76), (19, 1, 74), (20, .5, 75), (20.5, .5, 74),
        (21, .5, 72), (21.5, .5, 70), (22, 1, 69), (23, .5, 67), (23.5, .5, 69), (24, .5, 67), (24.5, .5, 64), (25, 1, 61),
        (26, .5, 64), (26.5, .5, 67), (27, 1, 69), (28, 2.5, 62),
        (32, .5, 67), (32.5, .5, 70), (33, .5, 74), (33.5, .5, 70), (34, 1, 67), (35, .5, 65), (35.5, .5, 67),
        (36, .5, 69), (36.5, .5, 65), (37, .5, 62), (37.5, .5, 65), (38, 1.5, 69), (40, .5, 68), (40.5, .5, 71),
        (41, .5, 74), (41.5, .5, 71), (42, 1, 68), (43, 1, 64), (44, .5, 67), (44.5, .5, 69), (45, .5, 73), (45.5, .5, 76),
        (46, 1.5, 73), (48, .5, 74), (48.5, .5, 77), (49, .5, 74), (49.5, .5, 72), (50, 1, 69), (51, .5, 70), (51.5, .5, 69),
        (52, .5, 67), (52.5, .5, 70), (53, .5, 69), (53.5, .5, 67), (54, 1, 64), (55, 1, 61), (56, .5, 62), (56.5, .5, 65),
        (57, .5, 69), (57.5, .5, 74), (58, 2.5, 74),
    ]
    beats = len(chords) * 4
    sec = beat_time(np.array([beats]))[0] + 1.5
    n = int(sec * SR)
    out = np.zeros((n, 2))

    def put(x, t, pan=0.5, gain=1.0):
        i = int(t * SR)
        m = min(len(x), n - i)
        out[i:i + m, 0] += x[:m] * gain * np.cos(pan * np.pi / 2)
        out[i:i + m, 1] += x[:m] * gain * np.sin(pan * np.pi / 2)

    for b, ln, m in mel:
        t0, t1 = beat_time(np.array([b, b + ln]))
        put(reed(mtof(m), t1 - t0 + 0.04, 0.9), t0, 0.42, 0.5)
    for bar, c in enumerate(chords):
        root = ROOT[c]
        tones = TONES[c]
        walk = [root, root + tones[1 if bar % 2 else 2], root + tones[2], root + (tones[3] if bar % 2 else 5)]
        for q in range(4):
            t0 = beat_time(np.array([bar * 4 + q]))[0]
            put(pluck_bass(mtof(walk[q] - 12), BEAT * 0.95, 0.9), t0, 0.5, 0.55)
            if q in (1, 3) or (q == 2 and bar % 4 == 3):
                put(keys([mtof(root + 12 + x) for x in tones[1:]], BEAT * 0.5, 1.0), beat_time(np.array([bar * 4 + q + (0.5 if q == 3 and bar % 2 else 0)]))[0], 0.62, 0.55)
            # brushes: a swirl on every beat, a tap on the swung off-beat, a soft kick on 1 and 3
            m = int(BEAT * SR)
            put(bp(noise(m), 2000, 8000) * env(m, 0.04, 0.16) * 0.12, t0, 0.55)
            mo = int(0.08 * SR)
            put(hp(noise(mo), 5000) * env(mo, 0.001, 0.03) * 0.25, beat_time(np.array([bar * 4 + q + 0.5]))[0], 0.6)
            if q in (0, 2):
                mk = int(0.25 * SR)
                tk = np.arange(mk) / SR
                put(np.sin(2 * np.pi * (70 * tk - 60 * tk * tk)) * env(mk, 0.002, 0.08) * 0.5, t0, 0.5)
    # a small room
    ir = noise(int(0.35 * SR)) * env(int(0.35 * SR), 0.001, 0.09) * 0.25
    for ch in range(2):
        out[:, ch] += signal.fftconvolve(out[:, ch], ir)[:n] * 0.5
    return loop(norm(out, 0.75), 1.5)


if __name__ == '__main__':
    for name, fn in (('hum', hum), ('wind', wind), ('traffic', traffic), ('murmur', murmur), ('steam', steam), ('cantina', cantina)):
        write(name, fn())
