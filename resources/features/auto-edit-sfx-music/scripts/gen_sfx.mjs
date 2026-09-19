// Generates src/lib/sfx/sfxBank.ts — the editor's sound-effects bank, SYNTHESIZED from scratch
// (license-free: every sample comes out of the oscillators, filters and noise below — no recorded
// or licensed audio, no binary assets, deterministic). Needs an ffmpeg with libopus on PATH (or
// FFMPEG=/path/to/ffmpeg) to encode the output.
//
// 44.1kHz STEREO. The previous bank was 24kHz mono, which put a hard ceiling at 12kHz: every
// sound was missing the 12-18kHz band entirely, and that band is most of what makes a sound
// read as expensive rather than synthesized. Mono compounded it — a centred, dry hit sounds
// flat next to one with a decorrelated tail either side of it.
//
// Every source now runs through master(): DC/rumble trim, transient shaping, an envelope-keyed
// AIR layer up where the old bank had nothing, harmonic saturation for weight, a diffused
// stereo tail (two decorrelated reverbs, dry core kept centred so the transient stays punchy),
// and a soft limiter instead of raw normalisation.
//
// Rerun to retune; never edit the bank by hand.

import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SR = 44100;

let rngState = 0x9e3779b9;
function rand() {
  rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 0xffffffff;
}
const noise = () => rand() * 2 - 1;
const sec = (s) => Math.round(s * SR);

// ── RBJ biquad (audio-eq-cookbook). type: 'lp' | 'hp' | 'bp'. Sweep by passing f0(t). ──
function biquad(type, f0OrFn, Q = 0.9) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, i, n) => {
    const f0 = typeof f0OrFn === 'function' ? f0OrFn(i / n) : f0OrFn;
    const w = (2 * Math.PI * Math.min(f0, SR * 0.45)) / SR;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** Schroeder reverb: 3 combs + 1 allpass. tail 0..1 sets feedback; wet is the mix. */
function reverb(dry, { tail = 0.55, wet = 0.28, extraMs = 320, spread = 1 } = {}) {
  const n = dry.length + sec(extraMs / 1000);
  const out = new Float32Array(n);
  // `spread` detunes the comb delays a few percent. Running the same dry signal through two
  // slightly different networks is what gives a decorrelated stereo tail without smearing the
  // transient the way a Haas delay would.
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => ({ buf: new Float32Array(sec(d * spread)), i: 0, fb: 0.55 + tail * 0.35 }));
  // Two extra allpasses: one diffuser leaves an audible flutter on percussive material.
  const aps = [0.0051, 0.0127, 0.0193].map((d) => ({ buf: new Float32Array(sec(d * spread)), i: 0, g: 0.5 }));
  for (let i = 0; i < n; i++) {
    const x = i < dry.length ? dry[i] : 0;
    let r = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = x + y * c.fb;
      c.i = (c.i + 1) % c.buf.length;
      r += y;
    }
    r /= combs.length;
    for (const ap of aps) {
      const ay = ap.buf[ap.i];
      ap.buf[ap.i] = r + ay * ap.g;
      ap.i = (ap.i + 1) % ap.buf.length;
      r = ay - ap.g * r;
    }
    out[i] = x * (1 - wet) + r * wet * 1.6;
  }
  return out;
}

const sat = (x, drive = 1.6) => Math.tanh(x * drive) / Math.tanh(drive);
function envAD(i, n, aMs, curve = 2) {
  const a = Math.min(1, i / Math.max(1, sec(aMs / 1000)));
  return a * Math.pow(1 - i / n, curve);
}
function normalize(buf, peak = 0.88) {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  if (m < 1e-6) return buf;
  const k = peak / m;
  return buf.map((v) => v * k);
}
/** Envelope follower — how loud the source is at each instant, smoothed. Used to key the air
 *  layer so the sparkle tracks the sound instead of sitting on top of it as constant hiss. */
function follower(buf, attackMs = 1, releaseMs = 60) {
  const a = Math.exp(-1 / (sec(attackMs / 1000) || 1));
  const r = Math.exp(-1 / (sec(releaseMs / 1000) || 1));
  const out = new Float32Array(buf.length);
  let e = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    e = v > e ? a * e + (1 - a) * v : r * e + (1 - r) * v;
    out[i] = e;
  }
  return out;
}

/** Soft-knee limiter. Saturating the WHOLE signal (the obvious tanh-everything version) rounds
 *  off the attack along with the peaks — it cost 13% of the crest factor and left the bank
 *  quieter than the one it replaced. Only material above the knee is bent; everything below it,
 *  which is the entire transient shape, passes through untouched. Normalised afterwards so the
 *  bank is consistently loud. */
function limit(buf, ceiling = 0.94, knee = 0.88) {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  if (m < 1e-6) return buf;
  const out = new Float32Array(buf.length);
  const k = 1 / m;                                  // bring the loudest sample to 1.0 first
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] * k;
    const a = Math.abs(v);
    out[i] = a <= knee ? v : Math.sign(v) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  let m2 = 0;
  for (const v of out) m2 = Math.max(m2, Math.abs(v));
  const g = ceiling / (m2 || 1);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

/** THE POLISH PASS. Turns a raw layered source into something that sounds produced.
 *  Returns [L, R]. */
function master(dry, { air = 0.5, width = 0.55, tail = 0.4, wet = 0.2, extraMs = 300, punch = 1 } = {}) {
  const n = dry.length;

  // Rumble and DC are inaudible but eat limiter headroom.
  const hp = biquad('hp', 28, 0.7);
  const core = new Float32Array(n);
  for (let i = 0; i < n; i++) core[i] = hp(dry[i], i, n);

  // Transient shaping: lift the first few ms so the hit still reads on a phone speaker.
  const tn = Math.max(1, sec(0.006));
  for (let i = 0; i < Math.min(tn, n); i++) core[i] *= 1 + 1.15 * punch * (1 - i / tn);

  // PRESENCE — a gentle lift around 3-5kHz, where the reference pack centres its energy. This
  // is the band that makes a UI sound feel solid and close rather than thin and far away, and
  // it is what the first bank was missing while it spent its budget on air nobody asked for.
  const pres = biquad('bp', 3800, 0.6);
  for (let i = 0; i < n; i++) core[i] += pres(core[i], i, n) * 0.34;

  // Harmonic weight — gentle. This is the BODY and it stays mono, so the transient hits dead
  // centre; width that smears the attack sounds cheap rather than big.
  for (let i = 0; i < n; i++) core[i] = sat(core[i], 1.12);

  // AIR — a bright noise layer keyed to the envelope, living at 9-18kHz. This band did not exist
  // at all in the 24kHz bank and is most of the perceived quality jump. Critically it is drawn
  // SEPARATELY per channel: two uncorrelated noise streams put real width up top while the body
  // below stays centred. Widening through the reverb tail alone barely moved correlation (1.000
  // to 0.917), because the wet mix is deliberately low on the twelve sounds that already reverb
  // inside synth().
  const env = follower(core, 0.5, 45);
  let epk = 0;
  for (const v of env) epk = Math.max(epk, v);
  const channel = () => {
    const c = new Float32Array(n);
    const fa = biquad('hp', 9000, 0.6);
    for (let i = 0; i < n; i++) {
      // CALIBRATED against a 67-file commercial UI pack: its median spectral centroid is 4.8kHz
      // and its median share of energy above 12kHz is ZERO. Premium UI audio is a MIDRANGE
      // event, not a bright one; 0.075 put us at 20.7% up there, which is why it read as fizz.
      const a = epk > 1e-6 ? fa(noise(), i, n) * (env[i] / epk) * air * 0.022 : 0;
      c[i] = core[i] + a * (0.35 + width);
    }
    return c;
  };

  // The reference pack sits around 0.74 L/R correlation — several of its sounds are close to
  // fully decorrelated. 0.16 of detune only got us to 0.90, which reads as almost mono.
  const L = limit(reverb(channel(), { tail, wet: wet * 1.35, extraMs, spread: 1 - width * 0.34 }));
  const R = limit(reverb(channel(), { tail, wet: wet * 1.35, extraMs, spread: 1 + width * 0.34 }));

  // A reverb tail decays exponentially, so the last third of the buffer is typically below
  // -60dBFS — inaudible, but at 44.1k stereo it is real bytes in the app bundle. Cut where both
  // channels have gone quiet for good. This is a pure size win, not a tonal change.
  const FLOOR = 10 ** (-48 / 20);   // -48dBFS: gone under any video mix, and the bytes are real
  let end = L.length;
  while (end > 1 && Math.abs(L[end - 1]) < FLOOR && Math.abs(R[end - 1]) < FLOOR) end--;
  // Leave a few ms so the decay ends on silence rather than a step, which would click.
  end = Math.min(L.length, end + sec(0.005));
  return [L.subarray(0, end), R.subarray(0, end)];
}

function mix(...layers) {
  const n = Math.max(...layers.map((l) => l.length));
  const out = new Float32Array(n);
  for (const l of layers) for (let i = 0; i < l.length; i++) out[i] += l[i];
  return out;
}

// ── the sounds ──
// ── parameterised voices ─────────────────────────────────────────────────────
// The first bank had 18 sounds, which is not enough for a library where a dozen things move in
// one template — runs came out as the same tick five times. These generators are pitched and
// shaped by argument so a family can have real variants: three ticks a fourth apart read as a
// ratchet, one tick five times reads as a stuck key.

/** Short pitched click: filtered noise burst + a decaying sine at f0. The reference pack lives
 *  around 3-5kHz, so that is where these sit unless asked otherwise. */
function clickAt(f0, dur = 0.09, bright = 1) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const f = biquad('bp', f0 * bright, 1.5);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const q = i / n;
    ph += (2 * Math.PI * f0 * (1 - 0.35 * q)) / SR;
    out[i] = (f(noise(), i, n) * 0.75 + Math.sin(ph) * 0.5) * Math.pow(1 - q, 3.2) * (i < sec(0.0015) ? 1.6 : 1);
  }
  return out;
}

/** Pitched bell/marker: two partials with a soft strike. Used for confirms and counters. */
function bellAt(f0, dur = 0.5, ratio = 2.76) {
  const n = sec(dur);
  const out = new Float32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const q = i / n;
    a += (2 * Math.PI * f0) / SR;
    b += (2 * Math.PI * f0 * ratio) / SR;
    out[i] = (Math.sin(a) * 0.7 + Math.sin(b) * 0.3 * Math.pow(1 - q, 2)) * Math.pow(1 - q, 2.1) * envAD(i, n, 2, 1);
  }
  return out;
}

/** Air pass with a controllable length and sweep direction — the whoosh/swish family. */
function airPass(dur, up = true, lo = 700, hi = 4200) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const f = biquad('bp', (q) => (up ? lo + (hi - lo) * q : hi - (hi - lo) * q), 0.9);
  for (let i = 0; i < n; i++) {
    const q = i / n;
    out[i] = f(noise(), i, n) * Math.sin(Math.PI * Math.min(1, q * 1.15)) * 0.95;
  }
  return out;
}

/** Mechanical detent: a two-stage click, like a switch or a dial notch. */
function detent(f0, gap = 0.02) {
  const a = clickAt(f0, 0.05);
  const b = clickAt(f0 * 0.72, 0.07);
  const n = a.length + sec(gap) + b.length;
  const out = new Float32Array(n);
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i + a.length + sec(gap)] += b[i] * 0.7;
  return out;
}

/** Digital stutter — the glitch/data family. */
function stutter(dur, rate, f0) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const step = Math.max(1, Math.round(SR / rate));
  const f = biquad('bp', f0, 2.2);
  for (let i = 0; i < n; i++) {
    const cell = Math.floor(i / step);
    const on = (cell * 2654435761 % 7) > 2;
    out[i] = on ? f(noise(), i, n) * Math.pow(1 - i / n, 1.3) : 0;
  }
  return out;
}

/** Brass-ish stacked saw with vibrato — the DJ airhorn. */
function airhorn(f0 = 415, dur = 0.9) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const lp = biquad('lp', 3200, 0.7);
  const ph = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const q = i / n;
    const vib = 1 + 0.012 * Math.sin((2 * Math.PI * 5.5 * i) / SR);
    let v = 0;
    [1, 1.5, 2.01].forEach((mult, k) => {
      ph[k] += (2 * Math.PI * f0 * mult * vib) / SR;
      // saw from its harmonic series — brighter and more brass than a sine
      v += ((ph[k] / Math.PI) % 2 - 1) * (k === 0 ? 0.6 : 0.28 / k);
    });
    const env = Math.min(1, q * 22) * (q > 0.82 ? Math.pow((1 - q) / 0.18, 1.6) : 1);
    out[i] = lp(v, i, n) * env;
  }
  return out;
}

/** A slow pitch glide on a tonal voice — trombone womp, slide whistle, boing. */
function glide(f0, f1, dur, kind = 'saw', wobble = 0) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const lp = biquad('lp', kind === 'sine' ? 2600 : 3400, 0.8);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const q = i / n;
    const f = f0 * Math.pow(f1 / f0, q) * (1 + wobble * Math.sin(2 * Math.PI * 7 * q));
    ph += (2 * Math.PI * f) / SR;
    const v = kind === 'sine' ? Math.sin(ph) : ((ph / Math.PI) % 2 - 1);
    out[i] = lp(v, i, n) * Math.min(1, q * 18) * Math.pow(1 - q, 1.1);
  }
  return out;
}

/** Square-wave chirps — the 8-bit shelf. */
function chip(notes, step = 0.06, duty = 0.5) {
  const n = sec(notes.length * step);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.min(notes.length - 1, Math.floor(i / sec(step)));
    const local = (i % sec(step)) / sec(step);
    ph += (2 * Math.PI * notes[k]) / SR;
    out[i] = (((ph / (2 * Math.PI)) % 1) < duty ? 1 : -1) * 0.5 * Math.pow(1 - local, 1.4);
  }
  return out;
}

/** Filtered noise band with a moving centre — record scratch, splat, crickets. */
function scrape(dur, f0, f1, rate = 0) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const f = biquad('bp', (q) => {
    const base = f0 * Math.pow(f1 / f0, q);
    return rate ? base * (1 + 0.55 * Math.sin(2 * Math.PI * rate * q)) : base;
  }, 3.2);
  for (let i = 0; i < n; i++) out[i] = f(noise(), i, n) * Math.sin(Math.PI * Math.min(1, i / n * 1.1));
  return out;
}

/** Drum-ish body: pitched sine thump plus a noise skin. */
function drum(f0, dur, noiseAmt = 0.5) {
  const n = sec(dur);
  const out = new Float32Array(n);
  const bp = biquad('bp', 2400, 1.1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const q = i / n;
    ph += (2 * Math.PI * f0 * (1 - 0.45 * q)) / SR;
    out[i] = (Math.sin(ph) * (1 - noiseAmt) + bp(noise(), i, n) * noiseAmt) * Math.pow(1 - q, 3);
  }
  return out;
}

/** Lay sounds end to end at given offsets (seconds). */
function seq(parts) {
  const n = Math.max(...parts.map(([buf, at]) => sec(at) + buf.length));
  const out = new Float32Array(n);
  for (const [buf, at, g = 1] of parts) {
    const o = sec(at);
    for (let i = 0; i < buf.length; i++) out[o + i] += buf[i] * g;
  }
  return out;
}

function synth(name) {
  // Pitched variants first — three ticks a fourth apart, three pops, three chimes, so a
  // staggered reveal can walk UP a scale instead of repeating one note.
  const EXTRA = {
    click_lo:  () => clickAt(1400, 0.10),
    click_mid: () => clickAt(2600, 0.08),
    click_hi:  () => clickAt(4200, 0.07),
    tick_lo:   () => clickAt(1800, 0.06),
    tick_mid:  () => clickAt(2700, 0.055),
    tick_hi:   () => clickAt(3600, 0.05),
    pop_lo:    () => clickAt(700, 0.13, 0.8),
    pop_mid:   () => clickAt(1000, 0.11, 0.8),
    pop_hi:    () => clickAt(1450, 0.10, 0.8),
    chime_lo:  () => bellAt(523, 0.62),
    chime_mid: () => bellAt(659, 0.58),
    chime_hi:  () => bellAt(880, 0.52),
    bell_soft: () => bellAt(392, 0.7, 1.98),
    confirm:   () => mix(bellAt(659, 0.45), (() => { const b = bellAt(988, 0.5); const o = new Float32Array(b.length + sec(0.07)); for (let i = 0; i < b.length; i++) o[i + sec(0.07)] = b[i] * 0.85; return o; })()),
    deny:      () => mix(bellAt(233, 0.3, 1.6), clickAt(180, 0.22, 0.5)),
    toggle_on: () => detent(2400),
    toggle_off: () => detent(1500),
    dial:      () => detent(3200, 0.012),
    swish_xs:  () => airPass(0.11, true, 1800, 6000),
    swish_sm:  () => airPass(0.2, true, 1100, 5200),
    swish_lg:  () => airPass(0.34, true, 700, 4200),
    whoosh_in: () => airPass(0.52, true, 320, 3400),
    whoosh_out: () => airPass(0.52, false, 320, 3400),
    lift:      () => airPass(0.85, true, 260, 2600),
    drop:      () => airPass(0.7, false, 2600, 220),
    glitch:    () => stutter(0.24, 70, 2600),
    data:      () => stutter(0.4, 26, 4200),
    scan:      () => stutter(0.6, 14, 5200),
    thud:      () => { const n = sec(0.3); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const q = i / n; ph += (2 * Math.PI * (70 + 60 * Math.exp(-q * 9))) / SR; o[i] = Math.sin(ph) * Math.pow(1 - q, 2.4); } return o; },
    knock:     () => mix(clickAt(320, 0.13, 0.6), clickAt(900, 0.05)),
    card:      () => airPass(0.16, false, 5200, 1400),
    stamp:     () => mix(clickAt(520, 0.14, 0.7), (() => { const t = sec(0.3); const o = new Float32Array(t); let ph = 0; for (let i = 0; i < t; i++) { const q = i / t; ph += (2 * Math.PI * 95) / SR; o[i] = Math.sin(ph) * Math.pow(1 - q, 3) * 0.6; } return o; })()),
    count_up:  () => clickAt(3100, 0.045),
    keytap:    () => clickAt(2200, 0.045, 1.2),

    // ── viral / meme shelf ──────────────────────────────────────────────
    airhorn:      () => airhorn(415, 0.85),
    airhorn_trip: () => seq([[airhorn(415, 0.22), 0], [airhorn(415, 0.22), 0.26], [airhorn(415, 0.6), 0.52]]),
    vine_boom:    () => { const n = sec(0.9); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const q = i / n; ph += (2 * Math.PI * (58 + 120 * Math.exp(-q * 14))) / SR; o[i] = Math.sin(ph) * Math.pow(1 - q, 1.35); } return o; },
    bass_drop:    () => glide(180, 34, 1.1, 'sine'),
    boing:        () => glide(760, 190, 0.42, 'sine', 0.22),
    slide_up:     () => glide(420, 2100, 0.5, 'sine'),
    slide_down:   () => glide(2100, 380, 0.55, 'sine'),
    sad_trombone: () => seq([[glide(330, 294, 0.34), 0], [glide(294, 262, 0.34), 0.3], [glide(262, 196, 0.75), 0.6]]),
    dun_dun_dun:  () => seq([[drum(150, 0.42, 0.25), 0], [drum(150, 0.42, 0.25), 0.42], [drum(96, 1.1, 0.2), 0.84]]),
    rimshot:      () => seq([[drum(320, 0.14, 0.35), 0], [drum(240, 0.16, 0.4), 0.13], [scrape(0.7, 6000, 9000), 0.27, 0.5]]),
    drumroll:     () => { const n = sec(1.1); const o = new Float32Array(n); const bp = biquad('bp', 2600, 1.0); for (let i = 0; i < n; i++) { const q = i / n; const hit = Math.sin(2 * Math.PI * (22 + 34 * q) * q * 1.1); o[i] = bp(noise(), i, n) * Math.max(0, hit) * (0.35 + 0.65 * q); } return o; },
    record_scratch: () => scrape(0.55, 900, 260, 3.5),
    buzzer:       () => { const n = sec(0.65); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const q = i / n; ph += (2 * Math.PI * 118) / SR; const sq = ((ph / (2 * Math.PI)) % 1) < 0.5 ? 1 : -1; o[i] = sq * 0.55 * (q > 0.88 ? (1 - q) / 0.12 : 1); } return o; },
    censor_beep:  () => { const n = sec(0.5); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { ph += (2 * Math.PI * 1000) / SR; const q = i / n; o[i] = Math.sin(ph) * 0.6 * Math.min(1, q * 40) * (q > 0.92 ? (1 - q) / 0.08 : 1); } return o; },
    coin_8bit:    () => chip([988, 1319], 0.075),
    powerup_8bit: () => chip([523, 659, 784, 1047, 1319], 0.055),
    fail_8bit:    () => chip([392, 370, 349, 262], 0.11, 0.35),
    splat:        () => seq([[drum(120, 0.16, 0.7), 0], [scrape(0.22, 3200, 700), 0.02, 0.8]]),
    suspense:     () => seq([[glide(120, 480, 1.3), 0, 0.55], [drum(90, 0.7, 0.15), 1.1]]),
    crickets:     () => { const n = sec(1.6); const o = new Float32Array(n); const bp = biquad('bp', 4600, 9); for (let i = 0; i < n; i++) { const t = i / SR; const chirp = (t % 0.42) < 0.05 ? 1 : 0; o[i] = bp(noise(), i, n) * chirp * 0.8; } return o; },
    applause:     () => { const n = sec(1.5); const o = new Float32Array(n); const bp = biquad('bp', 2200, 0.8); for (let i = 0; i < n; i++) { const q = i / n; o[i] = bp(noise(), i, n) * (0.35 + 0.65 * Math.min(1, q * 6)) * (q > 0.7 ? Math.pow((1 - q) / 0.3, 1.2) : 1) * (0.6 + 0.4 * Math.abs(noise())); } return o; },
  };
  if (EXTRA[name]) return EXTRA[name]();
  switch (name) {
    case 'whoosh': { // cinematic air pass: low body + airy top + faint doppler tone
      const n = sec(0.4);
      const body = new Float32Array(n); const air = new Float32Array(n); const tone = new Float32Array(n);
      const fb = biquad('bp', (q) => 240 + 1500 * Math.sin(q * Math.PI), 0.8);
      const fa = biquad('bp', (q) => 900 + 3000 * Math.sin(q * Math.PI * 0.92), 1.1);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        body[i] = fb(noise(), i, n) * envAD(i, n, 90, 1.5) * 0.9;
        air[i] = fa(noise(), i, n) * envAD(i, n, 130, 1.8) * 0.45;
        ph += (2 * Math.PI * (170 + 240 * Math.sin(q * Math.PI))) / SR;
        tone[i] = Math.sin(ph) * envAD(i, n, 140, 2.2) * 0.08;
      }
      return reverb(mix(body, air, tone), { tail: 0.35, wet: 0.18, extraMs: 88 });
    }
    case 'swish': { // fast light pass for quick reveals
      const n = sec(0.18);
      const out = new Float32Array(n);
      const f = biquad('bp', (q) => 1400 + 2600 * q, 1.2);
      for (let i = 0; i < n; i++) out[i] = f(noise(), i, n) * envAD(i, n, 30, 1.6) * 0.9;
      return out;
    }
    case 'slam': { // produced impact: click transient + mid thump + sub drop + tail
      const n = sec(0.42);
      const sub = new Float32Array(n); const thump = new Float32Array(n); const click = new Float32Array(n);
      const ft = biquad('bp', 210, 1.1);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        ph += (2 * Math.PI * (30 + 92 * Math.exp(-q * 11))) / SR;
        sub[i] = Math.sin(ph) * Math.pow(1 - q, 1.5) * 1.0;
        thump[i] = ft(noise(), i, n) * Math.pow(1 - q, 4) * 0.7;
        if (i < sec(0.006)) click[i] = noise() * (1 - i / sec(0.006)) * 0.8;
      }
      const dry = mix(sub, thump, click).map((v) => sat(v, 1.8));
      return reverb(dry, { tail: 0.5, wet: 0.22, extraMs: 132 });
    }
    case 'boom': { // trailer hit: deeper, longer, softer attack than slam
      const n = sec(0.6);
      const sub = new Float32Array(n); const rumble = new Float32Array(n);
      const fr2 = biquad('lp', 260, 0.7);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        ph += (2 * Math.PI * (26 + 42 * Math.exp(-q * 6))) / SR;
        sub[i] = Math.sin(ph) * Math.pow(1 - q, 1.2) * envAD(i, n, 8, 1) * 1.0;
        rumble[i] = fr2(noise(), i, n) * Math.pow(1 - q, 2.2) * 0.5;
      }
      const dry = mix(sub, rumble).map((v) => sat(v, 1.5));
      return reverb(dry, { tail: 0.75, wet: 0.3, extraMs: 264 });
    }
    case 'pop': { // glossy UI pop: pitch-drop body + tiny up-chirp sparkle
      const n = sec(0.13);
      const body = new Float32Array(n); const chirp = new Float32Array(n);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        p1 += (2 * Math.PI * (165 + 500 * Math.exp(-q * 10))) / SR;
        body[i] = Math.sin(p1) * envAD(i, n, 3, 1.6) * 0.95;
        p2 += (2 * Math.PI * (900 + 1400 * q)) / SR;
        chirp[i] = Math.sin(p2) * envAD(i, n, 2, 5) * 0.12;
      }
      return reverb(mix(body, chirp), { tail: 0.2, wet: 0.12, extraMs: 33 });
    }
    case 'snap': { // dry finger-snap transient
      const n = sec(0.07);
      const out = new Float32Array(n);
      const fh = biquad('hp', 2200, 0.8); const fb2 = biquad('bp', 950, 1.4);
      for (let i = 0; i < n; i++) {
        const q = i / n;
        out[i] = fh(noise(), i, n) * Math.pow(1 - q, 5) * 0.9 + fb2(noise(), i, n) * Math.pow(1 - q, 3) * 0.4;
      }
      return out;
    }
    case 'tick': { // soft count/typewriter tick
      const n = sec(0.04);
      const out = new Float32Array(n);
      const fh = biquad('hp', 2600, 0.8); const kb = biquad('bp', 1150, 2);
      for (let i = 0; i < n; i++) {
        out[i] = fh(noise(), i, n) * envAD(i, n, 1.2, 4) * 0.7 + kb(noise(), i, n) * envAD(i, n, 1.5, 5) * 0.35;
      }
      return out;
    }
    case 'type': { // single soft key thock
      const n = sec(0.05);
      const out = new Float32Array(n);
      const fl = biquad('lp', 1900, 0.8); const kn = biquad('bp', 320, 1.6);
      for (let i = 0; i < n; i++) {
        out[i] = fl(noise(), i, n) * envAD(i, n, 1.5, 4.5) * 0.6 + kn(noise(), i, n) * envAD(i, n, 2, 4) * 0.5;
      }
      return out;
    }
    case 'shutter': { // mechanical camera: clack + spring wind + second clack
      const n = sec(0.19);
      const out = new Float32Array(n);
      const fh = biquad('hp', 1100, 0.9); const spring = biquad('bp', 3400, 3);
      for (let i = 0; i < n; i++) {
        const t1 = i, t2 = i - sec(0.085);
        let x = 0;
        if (t1 < sec(0.018)) x += noise() * Math.pow(1 - t1 / sec(0.018), 2) * 1.0;
        if (t1 >= sec(0.02) && t1 < sec(0.08)) x += spring(noise(), i, n) * 0.25;
        if (t2 >= 0 && t2 < sec(0.026)) x += noise() * Math.pow(1 - t2 / sec(0.026), 2) * 0.85;
        out[i] = fh(x, i, n) * 0.95;
      }
      return reverb(out, { tail: 0.25, wet: 0.12, extraMs: 44 });
    }
    case 'chime': { // FM bell with detuned partials + shimmer tail
      const n = sec(0.7);
      const out = new Float32Array(n);
      const partials = [
        { f: 1152, a: 0.5 }, { f: 1157, a: 0.28 }, { f: 1728, a: 0.3 }, { f: 2310, a: 0.16 },
      ];
      const phases = partials.map(() => 0);
      let mph = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        mph += (2 * Math.PI * 2317) / SR;
        const fm = Math.sin(mph) * 22 * Math.pow(1 - q, 2);
        let s = 0;
        for (let k = 0; k < partials.length; k++) {
          phases[k] += (2 * Math.PI * (partials[k].f + fm)) / SR;
          s += Math.sin(phases[k]) * partials[k].a * Math.pow(1 - q, 2.1 + k * 0.35);
        }
        out[i] = s * envAD(i, n, 2, 1) * 0.7;
      }
      return reverb(out, { tail: 0.7, wet: 0.32, extraMs: 209 });
    }
    case 'glass': { // short luxe glass ping
      const n = sec(0.3);
      const out = new Float32Array(n);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        p1 += (2 * Math.PI * 2085) / SR; p2 += (2 * Math.PI * 3140) / SR;
        out[i] = (Math.sin(p1) * 0.55 + Math.sin(p2) * 0.25) * envAD(i, n, 1.5, 3.2) * 0.7;
      }
      return reverb(out, { tail: 0.45, wet: 0.24, extraMs: 110 });
    }
    case 'blip': { // rounded alert
      const n = sec(0.24);
      const out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        const f0 = q < 0.5 ? 680 : 905;
        ph += (2 * Math.PI * f0) / SR;
        out[i] = sat(Math.sin(ph) * 1.6, 2) * envAD(i, n, 12, 1.6) * 0.55;
      }
      return reverb(out, { tail: 0.3, wet: 0.14, extraMs: 55 });
    }
    case 'ignite': { // flame catch: swell + crackle + low rumble
      const n = sec(0.42);
      const swell = new Float32Array(n); const rumble = new Float32Array(n);
      const fs2 = biquad('bp', (q) => 500 + 900 * q, 0.9);
      const fr3 = biquad('lp', 340, 0.8);
      for (let i = 0; i < n; i++) {
        const q = i / n;
        const crackle = rand() < 0.006 ? noise() * 1.8 : 0;
        swell[i] = (fs2(noise(), i, n) + crackle) * Math.pow(q, 0.65) * Math.pow(1 - q, 0.8) * 0.9;
        rumble[i] = fr3(noise(), i, n) * Math.pow(q, 0.5) * Math.pow(1 - q, 1.1) * 0.5;
      }
      return reverb(mix(swell, rumble), { tail: 0.35, wet: 0.16, extraMs: 77 });
    }
    case 'cash': { // crisp note flutter + register ping
      const n = sec(0.46);
      const out = new Float32Array(n);
      const fh = biquad('hp', 850, 0.8);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        let x = 0;
        for (let k = 0; k < 5; k++) {
          const tk = i - sec(0.04 + k * 0.038);
          if (tk >= 0 && tk < sec(0.02)) x += noise() * Math.pow(1 - tk / sec(0.02), 1.6) * 0.5;
        }
        const tp = i - sec(0.22);
        if (tp >= 0) { ph += (2 * Math.PI * 1580) / SR; x += Math.sin(ph) * Math.pow(Math.max(0, 1 - tp / (n - sec(0.22))), 2.6) * 0.45; }
        out[i] = fh(x, i, n) * 0.95;
      }
      return reverb(out, { tail: 0.35, wet: 0.16, extraMs: 88 });
    }
    case 'coin': { // bright double ping — wins, points, milestones
      const n = sec(0.34);
      const out = new Float32Array(n);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        const t2 = i - sec(0.07);
        p1 += (2 * Math.PI * 1284) / SR;
        out[i] = Math.sin(p1) * envAD(i, n, 1.5, 3.4) * 0.5;
        if (t2 >= 0) { p2 += (2 * Math.PI * 1926) / SR; out[i] += Math.sin(p2) * Math.pow(1 - t2 / (n - sec(0.07)), 2.8) * 0.42; }
      }
      return reverb(out, { tail: 0.5, wet: 0.26, extraMs: 121 });
    }
    case 'paper': { // single card/page flick
      const n = sec(0.15);
      const out = new Float32Array(n);
      const f = biquad('bp', (q) => 1100 + 1600 * Math.sin(q * Math.PI), 1.1);
      for (let i = 0; i < n; i++) out[i] = f(noise(), i, n) * envAD(i, n, 18, 2) * 0.85;
      return out;
    }
    case 'riser': { // tension build that CUTS clean for the payoff
      const n = sec(0.8);
      const out = new Float32Array(n);
      const fn2 = biquad('bp', (q) => 300 + 1900 * q * q, 1.0);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        p1 += (2 * Math.PI * (150 + 660 * q * q)) / SR;
        p2 += (2 * Math.PI * (151.8 + 668 * q * q)) / SR;
        out[i] = (fn2(noise(), i, n) * 0.5 + (Math.sin(p1) + Math.sin(p2)) * 0.22) * Math.pow(q, 1.5) * 0.8;
      }
      return out; // no tail — it must cut into the impact
    }
    case 'sweep': { // long airy DOCU crescendo
      const n = sec(0.9);
      const out = new Float32Array(n);
      const f = biquad('lp', (q) => 500 + 2400 * q, 0.8);
      for (let i = 0; i < n; i++) {
        const q = i / n;
        out[i] = f(noise(), i, n) * Math.pow(q, 1.2) * Math.pow(1 - q, 0.45) * 0.7;
      }
      return reverb(out, { tail: 0.5, wet: 0.24, extraMs: 143 });
    }
    default: throw new Error(`unknown sfx ${name}`);
  }
}

/** Interleaved 16-bit stereo WAV. Deliberately NOT a compressed codec: mp3/aac carry an encoder
 *  priming delay of 20-30ms, and these cues are placed against a visual beat where that reads as
 *  late. WAV is sample-accurate. */
function toWavDataUri(L, R) {
  const n = Math.max(L.length, R.length);
  const bytes = n * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i] ?? 0));
    const r = Math.max(-1, Math.min(1, R[i] ?? 0));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 44 + i * 4 + 2);
  }
  return `data:audio/wav;base64,${buf.toString('base64')}`;
}

const IDS = [
  // originals
  'whoosh', 'swish', 'slam', 'boom', 'pop', 'snap', 'tick', 'type', 'shutter',
  'chime', 'glass', 'blip', 'ignite', 'cash', 'coin', 'paper', 'riser', 'sweep',
  // pitched variants — the point is that a run of five can be five DIFFERENT notes
  'click_lo', 'click_mid', 'click_hi',
  'tick_lo', 'tick_mid', 'tick_hi',
  'pop_lo', 'pop_mid', 'pop_hi',
  'chime_lo', 'chime_mid', 'chime_hi', 'bell_soft',
  // gestures the old bank simply had no word for
  'confirm', 'deny', 'toggle_on', 'toggle_off', 'dial',
  'swish_xs', 'swish_sm', 'swish_lg', 'whoosh_in', 'whoosh_out', 'lift', 'drop',
  'glitch', 'data', 'scan',
  'thud', 'knock', 'card', 'stamp', 'count_up', 'keytap',
  // viral / meme — the ARCHETYPES, synthesized. The famous recordings behind them are
  // copyrighted and cannot ship in a product; the gestures are not.
  'airhorn', 'airhorn_trip', 'vine_boom', 'bass_drop', 'boing', 'slide_up', 'slide_down',
  'sad_trombone', 'dun_dun_dun', 'rimshot', 'drumroll', 'record_scratch', 'buzzer',
  'censor_beep', 'coin_8bit', 'powerup_8bit', 'fail_8bit', 'splat', 'suspense',
  'crickets', 'applause',
];
/** Per-sound polish. A tight UI tick and a trailer boom do not want the same finish, and giving
 *  them one is exactly what makes a bank sound like a preset pack.
 *
 *  `wet` is deliberately LOW for the twelve sounds that already build their own tail inside
 *  synth() — master() adds a stereo tail on top of that, and stacking two full reverbs turns a
 *  transient to soup. The dry ones get the full treatment here instead. */
const POLISH = {
  //          air   width  tail   wet    extraMs  punch
  whoosh:  { air: 0.75, width: 0.85, tail: 0.45, wet: 0.10, extraMs: 143, punch: 0.6 },
  swish:   { air: 0.80, width: 0.70, tail: 0.25, wet: 0.16, extraMs: 77, punch: 0.8 },
  slam:    { air: 0.45, width: 0.55, tail: 0.55, wet: 0.10, extraMs: 176, punch: 1.4 },
  boom:    { air: 0.30, width: 0.60, tail: 0.75, wet: 0.10, extraMs: 286, punch: 1.2 },
  pop:     { air: 0.65, width: 0.35, tail: 0.20, wet: 0.08, extraMs: 61, punch: 1.2 },
  snap:    { air: 0.85, width: 0.40, tail: 0.22, wet: 0.18, extraMs: 72, punch: 1.5 },
  tick:    { air: 0.70, width: 0.25, tail: 0.15, wet: 0.14, extraMs:  80, punch: 1.3 },
  type:    { air: 0.60, width: 0.20, tail: 0.12, wet: 0.12, extraMs:  70, punch: 1.2 },
  shutter: { air: 0.80, width: 0.45, tail: 0.30, wet: 0.10, extraMs: 99, punch: 1.5 },
  chime:   { air: 0.95, width: 0.90, tail: 0.70, wet: 0.12, extraMs: 341, punch: 0.7 },
  glass:   { air: 1.00, width: 0.85, tail: 0.60, wet: 0.12, extraMs: 264, punch: 0.9 },
  blip:    { air: 0.60, width: 0.30, tail: 0.18, wet: 0.08, extraMs: 55, punch: 1.1 },
  ignite:  { air: 0.70, width: 0.75, tail: 0.55, wet: 0.10, extraMs: 187, punch: 0.9 },
  cash:    { air: 0.85, width: 0.60, tail: 0.40, wet: 0.10, extraMs: 143, punch: 1.1 },
  coin:    { air: 0.90, width: 0.50, tail: 0.35, wet: 0.10, extraMs: 121, punch: 1.2 },
  paper:   { air: 0.75, width: 0.55, tail: 0.25, wet: 0.18, extraMs: 88, punch: 0.9 },
  riser:   { air: 0.85, width: 0.95, tail: 0.65, wet: 0.20, extraMs: 231, punch: 0.5 },
  sweep:   { air: 0.80, width: 0.90, tail: 0.55, wet: 0.10, extraMs: 198, punch: 0.5 },
};

// ── loudness matching ────────────────────────────────────────────────────────
// Peak normalisation alone is a trap. Every sound ends up at the same PEAK, but a long
// sustained chime carries far more energy than a 0.14s snap that touches the same peak for two
// milliseconds — measured in a render, the entrance cue came out 13-40x louder than the ticks
// following it, so the cues after the first were inaudible and the whole library sounded like
// "one noise at the start and nothing else". Gains in the cue list can only mean something if
// the sounds they scale are already comparable, so the bank is matched on ENERGY first.
// Anything without an explicit row gets a sensible middle finish.
const DEFAULT_POLISH = { air: 0.5, width: 0.6, tail: 0.3, wet: 0.12, extraMs: 110, punch: 1.1 };

const rendered = IDS.map((id) => {
  rngState = 0x9e3779b9;
  return master(synth(id), POLISH[id] ?? DEFAULT_POLISH);
});

/** Loudness over the first 300ms — where a cue actually reads. Not the whole buffer: a long
 *  tail would drag the figure down and the sound would be pushed up to compensate. */
const loudnessOf = (L) => {
  const w = Math.min(L.length, sec(0.3));
  let s2 = 0;
  for (let i = 0; i < w; i++) s2 += L[i] * L[i];
  return Math.sqrt(s2 / Math.max(1, w));
};

const loud = rendered.map(([L]) => loudnessOf(L));
const TARGET = [...loud].sort((a, b) => a - b)[Math.floor(loud.length / 2)];   // the median sound

/** Drive a sound INTO a soft knee and re-peak it. Every sound already leaves master() peaking
 *  at the ceiling, so a quiet-but-peaky one (a snap: two loud milliseconds and nothing else)
 *  cannot be made louder by scaling — the first attempt tried, and the peak guard clamped every
 *  boost straight back to 1.0, so matching only ever worked downward. Raising perceived level at
 *  a fixed ceiling means COMPRESSING: bend the peaks, and the body comes up underneath them. */
function driveTo(L, R, drive, ceiling = 0.94, knee = 0.8) {
  const bend = (ch) => {
    const o = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i] * drive;
      const a = Math.abs(v);
      o[i] = a <= knee ? v : Math.sign(v) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
    }
    return o;
  };
 // Re-peaking is only correct when BOOSTING. Doing it after a reduction just restores the level
 // we asked it to give up, which is why the loud end of the bank would not come down.
  if (drive < 1) {
    const l0 = new Float32Array(L.length), r0 = new Float32Array(R.length);
    for (let i = 0; i < L.length; i++) { l0[i] = L[i] * drive; r0[i] = R[i] * drive; }
    return [l0, r0];
  }
  const l = bend(L), r = bend(R);
  let m = 0;
  for (let i = 0; i < l.length; i++) m = Math.max(m, Math.abs(l[i]), Math.abs(r[i]));
  const k = ceiling / (m || 1);
  for (let i = 0; i < l.length; i++) { l[i] *= k; r[i] *= k; }
  return [l, r];
}

// ── OUTPUT ───────────────────────────────────────────────────────────────────────────────
// Opus in WebM, not WAV. The WAV bank was ~10MB of base64; Opus is a small fraction of that at
// transparent quality for effects. Timing stays exact: Opus records its encoder pre-skip in the
// container header and every decoder trims it, unlike the mp3/aac priming delay that made the old
// bank insist on WAV.
const OUT_DIR = 'src/lib/sfx';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const tmp = mkdtempSync(join(tmpdir(), 'captik-sfx-'));
const entries = [];
let audioBytes = 0;
try {
  IDS.forEach((id, k) => {
    const [L, R] = rendered[k];
    // Bounded on both sides: a snap physically cannot sustain like a chime, and driving it hard
    // enough to try would just turn it to mush.
    const g = Math.max(0.45, Math.min(3.2, TARGET / (loud[k] || 1e-6)));
    const [gl, gr] = driveTo(L, R, g);
    const wav = join(tmp, `${id}.wav`);
    const webm = join(tmp, `${id}.webm`);
    writeFileSync(wav, Buffer.from(toWavDataUri(gl, gr).split(',')[1], 'base64'));
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav,
      '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-application', 'audio', webm]);
    const bytes = readFileSync(webm);
    audioBytes += bytes.length;
    entries.push(`  ${id}: 'data:audio/webm;base64,${bytes.toString('base64')}',`);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// TWO modules on purpose: sfxIds.ts (a few hundred bytes) names sounds and is imported
// statically; sfxBank.ts holds the audio and is reached ONLY through sfxLoader.ts's dynamic
// import, so an editor session that never touches sound effects never downloads it.
const ids = `// GENERATED by scripts/gen_sfx.mjs — do not edit by hand.
// Sound IDS ONLY. The audio lives in sfxBank.ts, code-split behind sfxLoader.ts — import THIS
// module to name a sound, never that one.

export type SfxId = ${IDS.map((i) => `'${i}'`).join(' | ')};

export const SFX_IDS: readonly SfxId[] = [${IDS.map((i) => `'${i}'`).join(', ')}];
`;
writeFileSync(join(OUT_DIR, 'sfxIds.ts'), ids);

const out = `// GENERATED by scripts/gen_sfx.mjs — do not edit by hand; rerun the script to retune.
// The editor's sound-effects bank: SYNTHESIZED from scratch (license-free — no recorded or
// licensed audio). Layered sources, RBJ biquad filtering, envelope-keyed air, harmonic saturation
// and a diffused stereo tail, encoded as Opus-in-WebM data URIs.
//
// NOTHING may import this module statically — it is loaded on demand by sfxLoader.ts, and
// sfx.spec.ts fails if anything else reaches for it. Import sfxIds.ts to name a sound; import
// sfxLoader.ts to play one.

import type { SfxId } from './sfxIds';

export const SFX: Record<SfxId, string> = {
${entries.join('\n')}
};
`;
writeFileSync(join(OUT_DIR, 'sfxBank.ts'), out);
console.log(`sfxIds.ts + sfxBank.ts written: ${IDS.length} sounds, ${Math.round(audioBytes / 1024)}KB of Opus, ${Math.round(out.length / 1024)}KB module`);
