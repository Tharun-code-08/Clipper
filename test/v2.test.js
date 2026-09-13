import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkAdaptive, toCaptikWords } from '../src/segments.js';
import { bestLag } from '../src/align.js';
import { validateStyle, editStateFor } from '../src/director.js';
import { sanitizeEdit, captionPropsFromEdit } from '../src/captikRender.js';
import { planSilenceChunks, wavSlice } from '../src/sarvamStt.js';
import { applyRoman, needsRoman } from '../src/romanize.js';

test('romanized captions keep every word, timing and style one-for-one', () => {
  const words = [
    { id: 'w0', text: '₹50', startMs: 0, endMs: 300, styleOverride: {} },
    { id: 'w1', text: 'लाख', startMs: 300, endMs: 600, styleOverride: { scale: 1.4 } },
    { id: 'w2', text: 'बर्बाद', startMs: 600, endMs: 900, styleOverride: {} },
    { id: 'w3', text: 'हैं।', startMs: 900, endMs: 1200, styleOverride: { animations: { screenShake: true } } },
    { id: 'w4', text: 'genuinely', startMs: 1200, endMs: 1500, styleOverride: {} },
  ];
  assert.ok(needsRoman(words));
  const out = applyRoman(words, ['₹50', 'lakh', 'barbaad', 'hain।', 'genuinely']);
  assert.deepEqual(out.map((w) => w.text), ['₹50', 'lakh', 'barbaad', 'hain.', 'genuinely']);
  assert.deepEqual(out.map((w) => [w.id, w.startMs, w.endMs]), words.map((w) => [w.id, w.startMs, w.endMs]));
  assert.equal(out[1].styleOverride.scale, 1.4);
  assert.deepEqual(out[3].styleOverride.animations, { screenShake: true });
  assert.equal(applyRoman(words, ['only', 'four', 'words', 'here']), null, 'a word-count mismatch is rejected, never mistimed');
  assert.ok(!needsRoman(out));
});

test('Sarvam chunks stay under 28 s and end on the quietest moment', () => {
  const hz = 100;
  const duration = 90;
  const env = Float32Array.from({ length: duration * hz }, (_, i) => {
    const t = i / hz;
    return Math.abs(t - 22.5) < 0.2 || Math.abs(t - 47.1) < 0.2 || Math.abs(t - 70.4) < 0.2 ? 5 : 3000;
  });
  const chunks = planSilenceChunks(env, duration);
  assert.ok(chunks.every((c) => c.end - c.start <= 28.01), JSON.stringify(chunks));
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, duration);
  chunks.slice(1).forEach((c, i) => assert.equal(c.start, chunks[i].end));
  assert.ok(Math.abs(chunks[0].end - 22.5) < 0.2, `first cut ${chunks[0].end}`);
  assert.ok(Math.abs(chunks[1].end - 47.1) < 0.2, `second cut ${chunks[1].end}`);
});

test('wavSlice writes a valid 16 kHz mono PCM header', () => {
  const pcm = Buffer.alloc(16000 * 2 * 3);
  const wav = wavSlice(pcm, 0.5, 2.0);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(40), 1.5 * 16000 * 2);
  assert.equal(wav.length, 44 + 1.5 * 16000 * 2);
});

const tw = (texts, gapAt = -1) => {
  let t = 0;
  return texts.map((text, i) => {
    if (i === gapAt) t += 600;
    const w = { id: `w${i}`, text, startMs: t, endMs: t + 250, styleOverride: {} };
    t += 300;
    return w;
  });
};

test('chunkAdaptive matches the Captik editor: ≤4 words, 24-char budget, pauses force a break', () => {
  const words = tw(['this', 'is', 'how', 'you', 'build', 'a', 'viral', 'clip']);
  assert.deepEqual(chunkAdaptive(words), [['w0', 'w1', 'w2', 'w3'], ['w4', 'w5', 'w6', 'w7']]);
  const long = tw(['engineering', 'graduate', 'unemployment', 'crisis']);
  assert.ok(chunkAdaptive(long).every((line) => line.length >= 2), 'never below two words unless a pause forces it');
  const paused = tw(['one', 'two', 'three', 'four'], 2);
  assert.deepEqual(chunkAdaptive(paused), [['w0', 'w1'], ['w2', 'w3']]);
});

test('toCaptikWords makes clip-relative ms words, strips punctuation, splits on sentences', () => {
  const src = [
    { w: 'Hello', s: 10.0, e: 10.3 }, { w: 'world.', s: 10.4, e: 10.8 },
    { w: 'This', s: 11.0, e: 11.2 }, { w: 'is', s: 11.25, e: 11.4 }, { w: 'Captik!', s: 11.5, e: 12.0 },
    { w: 'outside', s: 30, e: 30.4 },
  ];
  const { words, captionSegments } = toCaptikWords(src, { start: 10, end: 12.1 });
  assert.equal(words.length, 5);
  assert.equal(words[1].text, 'world');
  assert.equal(words[4].text, 'Captik');
  assert.equal(words[0].startMs, 0);
  assert.equal(words[4].endMs, 2000);
  assert.deepEqual(captionSegments, [['w0', 'w1'], ['w2', 'w3', 'w4']]);
});

test('bestLag finds a shifted envelope', () => {
  const hay = Float32Array.from({ length: 3000 }, (_, i) => Math.abs(Math.sin(i / 7) * 100 + Math.sin(i / 31) * 60 + ((i * 7919) % 13)));
  const needle = hay.slice(1234, 1234 + 800);
  const { lag, score } = bestLag(needle, hay);
  assert.equal(lag, 1234);
  assert.ok(score > 0.99);
});

test('director output is validated before it reaches the render', () => {
  const clip = { words: Array.from({ length: 30 }, (_, i) => ({ text: `w${i}` })) };
  const ids = ['hormozi', 'journal'];
  const s = validateStyle({
    captionStyle: 'not_a_template', accentColor: 'red', captionTextColor: '#ffffff', captionY: 140,
    captionFontScale: 9, captionLines: 'triple',
    emphasis: [{ word: 3, scale: 5 }, { word: 99, scale: 1.4 }, ...Array.from({ length: 10 }, (_, i) => ({ word: i, scale: 1.4 }))],
    shakeWords: [1, 1, 2, 3, 400],
  }, clip, ids);
  assert.equal(s.captionStyle, 'hormozi');
  assert.equal(s.accentColor, '#C8FF00');
  assert.equal(s.captionY, 88);
  assert.equal(s.captionFontScale, 1.4);
  assert.equal(s.captionLines, 'single');
  assert.ok(s.emphasis.length <= 5 && s.emphasis.every((e) => e.word < 30 && e.scale <= 1.8));
  assert.deepEqual(s.shakeWords, [1, 2]);

  const edit = editStateFor({ words: [{ id: 'w0', text: 'a', startMs: 0, endMs: 1, styleOverride: {} }, { id: 'w1', text: 'b', startMs: 1, endMs: 2, styleOverride: {} }], captionSegments: [['w0', 'w1']] },
    { ...s, emphasis: [{ word: 1, scale: 1.5 }], shakeWords: [0] });
  assert.equal(edit.words[1].styleOverride.scale, 1.5);
  assert.deepEqual(edit.words[0].styleOverride.animations, { screenShake: true });
  assert.equal(edit.captionBox.yPercent, 88);
});

test('editor saves are sanitised and map onto KineticCaption props', () => {
  const prev = {
    words: [{ id: 'w0', text: 'hi', startMs: 0, endMs: 300, styleOverride: {} }],
    captionSegments: [['w0']], captionStyle: 'hormozi', accentColor: '#C8FF00', captionTextColor: '#FFFFFF',
    captionBox: { xPercent: 50, yPercent: 75, widthPercent: 84 }, captionFontScale: 1, captionLines: 'single',
  };
  const next = sanitizeEdit({
    words: [{ id: 'w0', text: 'hey', startMs: 0, endMs: 300, styleOverride: { scale: 1.4 } }, { id: 'bad' }],
    captionSegments: [['w0', 'ghost'], []],
    captionStyle: 'journal', accentColor: 'javascript:alert(1)', captionBox: { xPercent: 40, yPercent: 30, widthPercent: 80 },
    captionLines: 'double', __proto__: { polluted: true },
  }, prev);
  assert.equal(next.words.length, 1);
  assert.equal(next.words[0].text, 'hey');
  assert.deepEqual(next.captionSegments, [['w0']]);
  assert.equal(next.captionStyle, 'journal');
  assert.equal(next.accentColor, '#C8FF00');
  assert.deepEqual(next.captionBox, { xPercent: 40, yPercent: 30, widthPercent: 80 });
  const props = captionPropsFromEdit(next);
  assert.equal(props.captionStyle, 'journal');
  assert.equal(props.captionLines, 'double');
  assert.ok(!('videoSrc' in props) && !('isPro' in props));
});
