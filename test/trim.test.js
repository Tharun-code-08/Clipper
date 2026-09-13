import test from 'node:test';
import assert from 'node:assert/strict';
import { retimeEdit, validateTrim, partCovers, overrideMapsFrom, trimWindow } from '../src/trim.js';
import { toCaptikWords } from '../src/segments.js';

// 20 source words, one every 0.5 s from 10.0 s; sentences end after w4, w9 and w14.
const source = Array.from({ length: 20 }, (_, i) => ({ w: `w${i}${[4, 9, 14].includes(i) ? '.' : ''}`, s: 10 + i * 0.5, e: 10 + i * 0.5 + 0.4 }));
// The clip [12, 17] holds w4..w13.
const clipEdit = () => ({ ...toCaptikWords(source, { start: 12, end: 17 }), lineOverrides: {}, captionStyle: 'tabahi' });

test('extending a clip keeps every edit and captions the newly revealed speech', () => {
  const edit = clipEdit();
  edit.words[0] = { ...edit.words[0], text: 'HOOK' };
  edit.words[1] = { ...edit.words[1], styleOverride: { scale: 1.4 } };
  const deleted = edit.words[6].id;
  edit.words = edit.words.filter((w) => w.id !== deleted);
  edit.captionSegments = edit.captionSegments.map((s) => s.filter((id) => id !== deleted)).filter((s) => s.length);
  edit.lineOverrides = { [edit.captionSegments[1][0]]: { styleId: 'journal' } };

  const { edit: next, added } = retimeEdit(edit, { oldStart: 12, oldEnd: 17, start: 11, end: 18, sourceWords: source, idPrefix: 'x' });

  assert.deepEqual(next.words.map((w) => w.text), ['w2', 'w3', 'HOOK', 'w5', 'w6', 'w7', 'w8', 'w9', 'w11', 'w12', 'w13', 'w14', 'w15']);
  assert.deepEqual(added.map((w) => w.text), ['w2', 'w3', 'w14', 'w15']);
  assert.ok(added.every((w) => w.id.startsWith('x')));
  const hook = next.words.find((w) => w.text === 'HOOK');
  assert.equal(hook.id, edit.words[0].id);
  assert.equal(hook.startMs, 1000);
  assert.deepEqual(next.words.find((w) => w.text === 'w5').styleOverride, { scale: 1.4 });
  assert.equal(new Set(next.words.map((w) => w.id)).size, next.words.length);
  assert.deepEqual(next.captionSegments.flat(), next.words.map((w) => w.id));
  assert.deepEqual(next.segmentStyleOverrides, { [edit.captionSegments[1][0]]: 'journal' });
  assert.equal(next.captionStyle, 'tabahi');
});

test('shortening drops words outside and moves a line override to its new first word', () => {
  const edit = clipEdit();
  const [first, second] = edit.captionSegments; // [w4] and [w5 w6 w7 w8]
  edit.lineOverrides = { [first[0]]: { styleId: 'gone' }, [second[0]]: { styleId: 'kept', text: 'replaced line' } };

  const { edit: next, dropped } = retimeEdit(edit, { oldStart: 12, oldEnd: 17, start: 12.6, end: 17, sourceWords: source });

  assert.equal(dropped, 2);
  assert.equal(next.words[0].text, 'w6');
  assert.equal(next.words[0].startMs, 400);
  assert.ok(next.words.every((w) => w.startMs >= 0 && w.endMs <= 4400));
  assert.deepEqual(next.captionSegments[0], second.slice(1));
  assert.deepEqual(next.lineOverrides, { [second[1]]: { styleId: 'kept' } });
  assert.deepEqual(next.segmentStyleOverrides, { [second[1]]: 'kept' });
  assert.deepEqual(next.lineTextOverrides, {});
});

test('trimming back to the original range restores the original captions', () => {
  const edit = clipEdit();
  const wide = retimeEdit(edit, { oldStart: 12, oldEnd: 17, start: 11, end: 18, sourceWords: source }).edit;
  const back = retimeEdit(wide, { oldStart: 11, oldEnd: 18, start: 12, end: 17, sourceWords: source }).edit;
  assert.deepEqual(back.words, edit.words);
  assert.deepEqual(back.captionSegments, edit.captionSegments);
});

test('validateTrim enforces the source bounds and clip length', () => {
  assert.deepEqual(validateTrim({ start: 1.23456, end: 20 }, { sourceDuration: 60 }), { start: 1.235, end: 20, duration: 18.765 });
  assert.throws(() => validateTrim({ start: 5, end: 6 }, { sourceDuration: 60 }), /at least/);
  assert.throws(() => validateTrim({ start: -1, end: 20 }, { sourceDuration: 60 }), /inside the video/);
  assert.throws(() => validateTrim({ start: 10, end: 61 }, { sourceDuration: 60 }), /inside the video/);
  assert.throws(() => validateTrim({ start: 0, end: 200 }, { sourceDuration: 600 }), /under/);
  assert.throws(() => validateTrim({ start: 'a', end: 20 }, { sourceDuration: 60 }), (err) => err.status === 400);
});

test('partCovers and trimWindow', () => {
  assert.equal(partCovers({ local: true }, { start: 0, end: 999 }), true);
  assert.equal(partCovers({ offset: 99, duration: 42 }, { start: 100, end: 140 }), true);
  assert.equal(partCovers({ offset: 99, duration: 42 }, { start: 98, end: 140 }), false);
  assert.equal(partCovers({ offset: 99, duration: 42 }, { start: 100, end: 141 }), false);
  assert.equal(partCovers(null, { start: 1, end: 2 }), false);
  assert.deepEqual(trimWindow({ clip: { start: 5, end: 20 }, sourceDuration: 30, contextSec: 10 }), { from: 0, to: 30 });
  assert.deepEqual(overrideMapsFrom([['a']], { a: { box: { xPercent: 1 } }, b: { styleId: 'x' } }).segmentBoxOverrides, { a: { xPercent: 1 } });
});
