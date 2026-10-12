"""Lightsaber hit (a blade striking a body), synthesized in the manner of the films' burn sound — an original sound,
no film audio or samples used (public/audio/README.md):

- a crack: a few milliseconds of bright noise, the blade's contact
- the sizzle: band-passed noise (the hiss of the burn) with a crackle of sparse sharp pops through it, swelling in
  a few milliseconds and dying over a quarter of a second
- the hum overdriven: two detuned saws at the hum's pitch bent up by the strike and sagging back, through a hard
  tanh clip (the buzzing "zzzt" of the blade biting), fading with the sizzle
- a low thump under it, its pitch falling

    python3 tools/saber_hit_synth.py -> public/audio/sfx/saber/hit_{1,2,3}.wav (44.1 kHz mono 16-bit)

numpy only. Each variant has its own seed, pitch and length; the level is set from the clash samples' loudness
so the mix (src/core/audio.js saberSound 'hit') stays as it was.
"""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio/sfx/saber'
SR = 44100
HUM_HZ = 92.0  # the hum's fundamental


def band(x, lo, hi):
    """Band-pass by masking the spectrum (offline, soft edges)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.clip((f - lo * 0.8) / (lo * 0.4), 0, 1) * np.clip((hi * 1.25 - f) / (hi * 0.5), 0, 1)
    return np.fft.irfft(X * m, len(x))


def saw(phase):
    return 2 * (phase - np.floor(phase + 0.5))


def hit(seed, pitch, dur):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.arange(n) / SR
    # the crack
    crack = band(rng.standard_normal(n), 2500, 12000) * np.exp(-t / 0.006)
    # the sizzle: hiss with crackle through it
    hiss = band(rng.standard_normal(n), 1800 * pitch, 7500 * pitch)
    hiss /= np.abs(hiss).max()
    pops = np.zeros(n)
    rate = 900 * np.exp(-t / 0.12) + 60  # pops a second, thinning out
    where = rng.random(n) < rate / SR
    pops[where] = rng.choice([-1, 1], where.sum()) * rng.uniform(0.4, 1, where.sum())
    kern = np.exp(-np.arange(int(SR * 0.002)) / (SR * 0.0004))
    pops = band(np.convolve(pops, kern)[:n], 1500, 14000)
    pops /= np.abs(pops).max() + 1e-9
    env = (1 - np.exp(-t / 0.004)) * np.exp(-t / (0.11 * dur / 0.45))
    sizzle = (hiss * 0.7 + pops * 0.6) * env * (1 + 0.35 * np.sin(2 * np.pi * 31 * t))  # a little flutter
    # the hum overdriven: bent up by the strike, sagging back below
    bend = 1 + 0.55 * np.exp(-t / 0.03) - 0.12 * (1 - np.exp(-t / 0.15))
    f0 = HUM_HZ * pitch * bend
    ph = np.cumsum(f0) / SR
    buzz = saw(ph) + saw(ph * 1.012 + 0.3) + 0.5 * saw(ph * 2.003)
    buzz = np.tanh(buzz * 3.5) * (1 - np.exp(-t / 0.003)) * np.exp(-t / (0.13 * dur / 0.45))
    buzz = band(buzz, 70, 5000)
    # the thump
    fth = 75 * np.exp(-t / 0.05) + 42
    thump = np.sin(2 * np.pi * np.cumsum(fth) / SR) * np.exp(-t / 0.07)
    x = crack * 0.5 + sizzle * 0.8 + buzz * 0.45 + thump * 0.5
    fade = np.minimum(1, (n - np.arange(n)) / (SR * 0.02))  # no click at the end
    return x * fade


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def read(p):
    with wave.open(str(p)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


def write(p, x):
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def main():
    # the clash samples' loudness over their first 0.25 s: the hit at about two thirds of it (the old hit's level)
    ref = np.mean([rms(read(OUT / f'clash_{i}.wav')[: int(SR * 0.25)]) for i in (1, 2, 3, 4)])
    for i, (seed, pitch, dur) in enumerate([(11, 1.0, 0.45), (23, 1.08, 0.4), (37, 0.93, 0.5)], 1):
        x = hit(seed, pitch, dur)
        x *= ref * 0.65 / rms(x[: int(SR * 0.25)])
        peak = np.abs(x).max()
        if peak > 0.95:
            x *= 0.95 / peak
        write(OUT / f'hit_{i}.wav', x)
        print(f'hit_{i}.wav {dur:.2f}s peak {np.abs(x).max():.2f} rms {rms(x[: int(SR * 0.25)]):.3f} (clash {ref:.3f})')


if __name__ == '__main__':
    main()
