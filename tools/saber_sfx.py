#!/usr/bin/env python3
"""Lightsaber sound effects, synthesized from scratch (numpy + scipy).

No recorded or sampled audio is used: every sound below is built from
sawtooth/sine oscillators, filtered noise and damped resonators.

    python3 tools/saber_sfx.py            # writes public/audio/sfx/saber_*.wav
    python3 tools/saber_sfx.py --out DIR  # somewhere else

It also adds the files to public/audio/index.json (only the "sfx" keys it
owns; any other entries, such as voice clips, are kept), so the game picks
them up instead of its built-in WebAudio synth.

Tweak the parameters in the block below and run it again.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

# --------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------
SR = 44100                 # sample rate (Hz)
SEED = 1977                # random seed: same parameters -> same files

# Hum (idle loop)
BASE_FREQ = 92.0           # fundamental of the motor hum, 80-120 Hz
DETUNE_CENTS = (0.0, +9.0, -6.0)   # one sawtooth per entry, detuned in cents
SAW_LEVELS = (1.0, 0.8, 0.6)       # relative level of each sawtooth
HUM_CUTOFF = 520.0         # low-pass corner of the hum (Hz); higher = brighter
HUM_DRIVE = 1.6            # soft saturation; 1 = clean, 3 = gritty
HUM_WOBBLE = 0.04          # slow amplitude wobble depth (0 = none)
LOOP_SECONDS = 3.0         # loop length; frequencies snap to whole cycles so it loops seamlessly

# Buzz (thin electrical noise layered on the hum)
BUZZ_AMOUNT = 0.10         # buzz level relative to the hum (RMS ratio); 0 = off
BUZZ_BAND = (3200.0, 8500.0)   # band of the buzz noise (Hz)
BUZZ_MAINS = 0.6           # how strongly the buzz pulses with the hum (0 = steady hiss)

# Swing (Doppler pass of the blade), one entry per variant:
#   dur: length (s), speed: blade speed (relative), dist: closest distance
#   (smaller = sharper, louder peak), pitch: pitch rise at the peak, doppler:
#   extra high-before / low-after shift, bright: brightness boost at the peak
SWINGS = (
    dict(dur=0.42, speed=1.35, dist=0.30, pitch=0.30, doppler=0.10, bright=4.0),   # quick slash
    dict(dur=0.58, speed=1.00, dist=0.38, pitch=0.24, doppler=0.12, bright=3.0),   # standard swing
    dict(dur=0.80, speed=0.70, dist=0.46, pitch=0.18, doppler=0.14, bright=2.2),   # heavy overhead
)
SWING_WHOOSH = 0.18        # air-noise level in the swing (relative)

# Clash
CLASH_MODES = (            # metallic resonances: (freq Hz, decay s, level)
    (1210.0, 0.22, 1.00),
    (1957.0, 0.16, 0.75),
    (2733.0, 0.12, 0.60),
    (3862.0, 0.08, 0.45),
    (5170.0, 0.05, 0.35),
    (6644.0, 0.035, 0.25),
)
CLASH_NOISE = 0.9          # level of the initial noise burst
CLASH_CRACKLE = 0.35       # electrical crackle after the hit
CLASH_SECONDS = 0.7

# Ignite / retract
IGNITE_SECONDS = 0.75
IGNITE_FROM = 0.30         # starting pitch as a fraction of BASE_FREQ
IGNITE_OVERSHOOT = 1.08    # brief pitch overshoot before settling
RETRACT_SECONDS = 0.55
RETRACT_TO = 0.28          # final pitch as a fraction of BASE_FREQ

# Output levels
HUM_RMS = 0.40             # loudness of the hum loop
PEAK = dict(swing=0.24, clash=0.40, on=0.40, off=0.30)   # matched to the game's other effects

# --------------------------------------------------------------------------

rng = np.random.default_rng(SEED)
NYQ = SR / 2


def cents(c):
    return 2.0 ** (c / 1200.0)


def lowpass_weight(f, fc):
    """Magnitude of a 2nd-order low-pass at frequency f (broadcasts)."""
    return 1.0 / np.sqrt(1.0 + (f / fc) ** 4)


def saturate(x, drive):
    return np.tanh(drive * x) / np.tanh(drive) if drive > 1.0 else x


def saw_bank(phase_fn, freq_fn, n, bright_fn=None, levels=SAW_LEVELS, detune=DETUNE_CENTS):
    """Band-limited sawtooths built from harmonics.

    phase_fn(ratio) -> phase (radians) of the fundamental for a saw at
    `ratio` x the base frequency; freq_fn(ratio) -> instantaneous frequency.
    bright_fn() -> per-sample low-pass corner (Hz) or None for HUM_CUTOFF.
    """
    out = np.zeros(n)
    fc = HUM_CUTOFF if bright_fn is None else bright_fn()
    for c, lvl in zip(detune, levels):
        r = cents(c)
        ph = phase_fn(r) + rng.uniform(0, 2 * np.pi)
        f = freq_fn(r)
        fmax = np.max(f)
        for k in range(1, int(0.95 * NYQ / fmax) + 1):
            w = lowpass_weight(k * f, fc) / k
            if np.max(w) < 1e-4:
                break
            out += lvl * w * np.sin(k * ph)
    return out * (2 / np.pi)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def norm_peak(x, peak):
    return x * (peak / (np.max(np.abs(x)) + 1e-12))


def fade(x, t_in=0.0, t_out=0.0):
    n = len(x)
    env = np.ones(n)
    a, b = int(t_in * SR), int(t_out * SR)
    if a:
        env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b:
        env[n - b:] = np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x * env


def band_noise(n, lo, hi, order=4):
    sos = signal.butter(order, [lo / NYQ, min(hi / NYQ, 0.99)], btype='band', output='sos')
    return signal.sosfilt(sos, rng.standard_normal(n))


def sweep_bandpass(x, f0, f1, q=2.0):
    """Time-varying resonant band-pass (state-variable filter), f0/f1 arrays or scalars."""
    n = len(x)
    fc = np.broadcast_to(np.asarray(f0, float), (n,)) if np.ndim(f0) else np.full(n, f0)
    if f1 is not None:
        fc = np.geomspace(f0, f1, n)
    g = 2 * np.sin(np.pi * np.clip(fc, 20, NYQ * 0.45) / SR)
    damp = 1.0 / q
    low = band = 0.0
    y = np.empty(n)
    for i in range(n):
        high = x[i] - low - damp * band
        band += g[i] * high
        low += g[i] * band
        y[i] = band
    return y


# --------------------------------------------------------------------------
# Hum loop
# --------------------------------------------------------------------------

def make_hum():
    n = int(LOOP_SECONDS * SR)
    t = np.arange(n) / SR
    # snap every saw to a whole number of cycles per loop -> seamless repeat
    q = 1.0 / LOOP_SECONDS
    snap = lambda f: max(q, round(f / q) * q)
    hum = np.zeros(n)
    for c, lvl in zip(DETUNE_CENTS, SAW_LEVELS):
        f = snap(BASE_FREQ * cents(c))
        ph = 2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)
        for k in range(1, int(0.95 * NYQ / f) + 1):
            w = lowpass_weight(k * f, HUM_CUTOFF) / k
            if w < 1e-4:
                break
            hum += lvl * w * np.sin(k * ph)
    hum = saturate(hum / np.max(np.abs(hum)), HUM_DRIVE)
    # slow wobble: whole cycles per loop, too
    wob = 1 + HUM_WOBBLE * np.sin(2 * np.pi * snap(0.7) * t) + HUM_WOBBLE * 0.5 * np.sin(2 * np.pi * snap(1.9) * t + 1.3)
    hum *= wob
    return hum * (HUM_RMS / rms(hum)), snap(BASE_FREQ)


def make_buzz(hum_rms, base):
    """Periodic band-limited noise: random spectrum in the band, inverse FFT."""
    n = int(LOOP_SECONDS * SR)
    spec = np.zeros(n // 2 + 1, complex)
    f = np.fft.rfftfreq(n, 1 / SR)
    band = (f >= BUZZ_BAND[0]) & (f <= BUZZ_BAND[1])
    spec[band] = rng.standard_normal(band.sum()) + 1j * rng.standard_normal(band.sum())
    # gentle tilt: thinner at the top
    spec *= np.where(band, (BUZZ_BAND[0] / np.maximum(f, 1)) ** 0.5, 0)
    buzz = np.fft.irfft(spec, n)
    # pulse with the hum (twice per cycle, like a mains/motor buzz)
    t = np.arange(n) / SR
    pulse = (1 - BUZZ_MAINS) + BUZZ_MAINS * np.abs(np.sin(2 * np.pi * base * t)) ** 3 * 2.2
    buzz *= pulse
    return buzz * (BUZZ_AMOUNT * hum_rms / rms(buzz))


# --------------------------------------------------------------------------
# One-shots
# --------------------------------------------------------------------------

def make_swing(p):
    n = int(p['dur'] * SR)
    t = np.arange(n) / SR
    # blade tip passes the listener at the midpoint; x is its position
    x = (t - p['dur'] * 0.45) * p['speed'] * 4.0
    d = p['dist']
    prox = d * d / (x * x + d * d)               # 1 at the closest point
    radial = x / np.sqrt(x * x + d * d)          # -1 approaching .. +1 leaving
    ratio = (1 + p['pitch'] * prox) / (1 + p['doppler'] * radial)
    freq_fn = lambda r: BASE_FREQ * r * ratio
    phase_fn = lambda r: 2 * np.pi * np.cumsum(BASE_FREQ * r * ratio) / SR
    bright = lambda: HUM_CUTOFF * (1 + p['bright'] * prox)
    tone = saw_bank(phase_fn, freq_fn, n, bright)
    tone = saturate(tone / np.max(np.abs(tone)), HUM_DRIVE + 0.6 * p['bright'] / 4)
    amp = 0.25 + 0.75 * prox ** 0.8
    # air: band noise whose centre follows the pitch
    air = sweep_bandpass(rng.standard_normal(n), 700 * ratio * (1 + 1.5 * prox), None, q=1.6)
    air = air / (np.max(np.abs(air)) + 1e-9) * prox
    out = tone * amp + SWING_WHOOSH * air
    return norm_peak(fade(out, 0.04, 0.08), PEAK['swing'])


def make_clash():
    n = int(CLASH_SECONDS * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    # strike: very short, bright noise burst
    burst = band_noise(n, 1800, 14000, 2) * np.exp(-t / 0.006)
    out += CLASH_NOISE * burst / np.max(np.abs(burst))
    # metal: damped inharmonic modes, each doubled with a slight beat
    for f, tau, lvl in CLASH_MODES:
        f *= 1 + rng.uniform(-0.01, 0.01)
        env = np.exp(-t / tau) * (1 - np.exp(-t / 0.0008))
        out += lvl * 0.5 * env * (np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * (f + 4.5) * t + 0.7))
    # energy discharge: the hum spikes up a fifth and snaps back, fast decay
    ratio = 1 + 0.6 * np.exp(-t / 0.05)
    spike = saw_bank(lambda r: 2 * np.pi * np.cumsum(BASE_FREQ * r * ratio) / SR,
                     lambda r: BASE_FREQ * r * ratio, n, lambda: HUM_CUTOFF * (1 + 5 * np.exp(-t / 0.08)))
    out += 0.9 * saturate(spike / np.max(np.abs(spike)), 3.0) * np.exp(-t / 0.12)
    # crackle: sparse tiny clicks of high noise
    crk = np.zeros(n)
    for _ in range(26):
        at = int(rng.uniform(0.004, 0.22) * SR)
        ln = int(rng.uniform(0.0008, 0.004) * SR)
        crk[at:at + ln] += rng.uniform(0.3, 1.0) * rng.choice([-1, 1])
    crk = signal.sosfilt(signal.butter(2, 3000 / NYQ, 'high', output='sos'), crk)
    out += CLASH_CRACKLE * crk / (np.max(np.abs(crk)) + 1e-9) * np.exp(-t / 0.15)
    return norm_peak(fade(out, 0, 0.1), PEAK['clash'])


def make_ignite():
    n = int(IGNITE_SECONDS * SR)
    t = np.arange(n) / SR
    # pitch ramps up from a low growl, overshoots, settles on the hum
    rise = 0.28
    ratio = np.where(
        t < rise,
        IGNITE_FROM * (IGNITE_OVERSHOOT / IGNITE_FROM) ** (t / rise),
        1 + (IGNITE_OVERSHOOT - 1) * np.exp(-(t - rise) / 0.08),
    )
    bright = lambda: HUM_CUTOFF * (1 + 2.5 * np.exp(-t / 0.2))
    tone = saw_bank(lambda r: 2 * np.pi * np.cumsum(BASE_FREQ * r * ratio) / SR,
                    lambda r: BASE_FREQ * r * ratio, n, bright)
    tone = saturate(tone / np.max(np.abs(tone)), HUM_DRIVE + 1.0)
    amp = np.clip(t / 0.09, 0, 1) * (1 + 0.35 * np.exp(-((t - 0.16) / 0.08) ** 2))
    # the loop takes over in the game, so the sustained hum fades out
    amp *= np.where(t > 0.35, np.exp(-(t - 0.35) / 0.12), 1)
    snap = band_noise(n, 2000, 12000, 2) * np.exp(-t / 0.012)
    hiss = sweep_bandpass(rng.standard_normal(n), 900, 2600, q=1.5) * np.exp(-t / 0.18) * np.clip(t / 0.02, 0, 1)
    out = tone * amp + 0.9 * snap / np.max(np.abs(snap)) + 0.35 * hiss / np.max(np.abs(hiss))
    return norm_peak(fade(out, 0, 0.05), PEAK['on'])


def make_retract():
    n = int(RETRACT_SECONDS * SR)
    t = np.arange(n) / SR
    k = np.clip(t / (RETRACT_SECONDS * 0.8), 0, 1)
    ratio = RETRACT_TO ** (k ** 1.4)          # pitch falls, slowly first, then drops away
    bright = lambda: HUM_CUTOFF * (1.6 - 1.1 * k)
    tone = saw_bank(lambda r: 2 * np.pi * np.cumsum(BASE_FREQ * r * ratio) / SR,
                    lambda r: BASE_FREQ * r * ratio, n, bright)
    tone = saturate(tone / np.max(np.abs(tone)), HUM_DRIVE + 0.8)
    amp = (1 - k) ** 1.2 * (1 + 0.25 * np.exp(-t / 0.05))
    hiss = sweep_bandpass(rng.standard_normal(n), 2400, 600, q=1.8) * np.exp(-t / 0.14)
    click = band_noise(n, 1500, 9000, 2) * np.exp(-np.maximum(0, t - RETRACT_SECONDS * 0.8) / 0.004) * (t >= RETRACT_SECONDS * 0.8)
    out = tone * amp + 0.25 * hiss / np.max(np.abs(hiss)) + 0.25 * click / (np.max(np.abs(click)) + 1e-9)
    return norm_peak(fade(out, 0.005, 0.03), PEAK['off'])


# --------------------------------------------------------------------------

def write(path, x):
    x = np.clip(x, -1, 1)
    wavfile.write(path, SR, (x * 32767).astype(np.int16))
    print(f'  {path}  {len(x) / SR:.2f}s  peak {np.max(np.abs(x)):.2f}')


def main():
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', type=Path, default=root / 'public/audio/sfx')
    ap.add_argument('--no-index', action='store_true', help='do not touch public/audio/index.json')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    hum, base = make_hum()
    files = {
        'saber_hum.wav': hum,
        'saber_buzz.wav': make_buzz(rms(hum), base),
        'saber_clash.wav': make_clash(),
        'saber_on.wav': make_ignite(),
        'saber_off.wav': make_retract(),
    }
    for i, p in enumerate(SWINGS, 1):
        files[f'saber_swing_{i}.wav'] = make_swing(p)
    for name, x in files.items():
        write(args.out / name, x)

    if args.no_index:
        return
    index = root / 'public/audio/index.json'
    data = json.loads(index.read_text()) if index.exists() else {}
    rel = lambda f: (args.out / f).resolve().relative_to(index.parent.resolve()).as_posix()
    sfx = data.setdefault('sfx', {})
    sfx.update({
        'hum': rel('saber_hum.wav'),
        'buzz': rel('saber_buzz.wav'),
        'swing': [rel(f'saber_swing_{i}.wav') for i in range(1, len(SWINGS) + 1)],
        'clash': rel('saber_clash.wav'),
        'ignite': rel('saber_on.wav'),
        'retract': rel('saber_off.wav'),
    })
    index.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'  {index} updated')


if __name__ == '__main__':
    main()
