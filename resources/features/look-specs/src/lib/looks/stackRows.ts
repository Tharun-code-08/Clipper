// How a stacked lockup breaks a phrase into rows — their buildStackRows, read from the public planner
// their site ships and checked on their footage ("One / sharp / visual", "makes people / stop /
// scrolling"): a row ends where the tier class changes (plain to emphasised or back), where it is
// full (maxPerRow), before a hero word, and after one — a hero always stands alone. Each row is
// scaled by its own tier (rowScale[tier]), so the hero row is the big one WHEREVER it lands; the
// rows after it go back to the plain size. Row-index scales, which this replaces, drew the row
// after the hero at the hero's size.
//
//   heroPair: a pop word (tier 1) may join a lone hero's row when the two are short (11 letters).
//   hyphenSplit: a hero word with a hyphen inside and 8+ letters breaks at the hyphen into two rows.
//
// Pure: the preview and every render route share it.

export interface StackRow<W> { words: W[]; tier: number }

export function buildStackRows<W extends { id: string; text: string }>(
  phrase: W[], tierOf: (w: W) => number, maxPerRow = 2,
  opts: { heroPair?: boolean; hyphenSplit?: boolean } = {},
): StackRow<W>[] {
  const per = Math.max(1, maxPerRow);
  let words: W[] = phrase;
  const split = new Set<string>();
  if (opts.hyphenSplit) {
    words = phrase.flatMap((w) => {
      const at = w.text.indexOf('-');
      if (tierOf(w) < 2 || at <= 0 || at >= w.text.length - 1 || w.text.length < 8) return [w];
      const a = { ...w, id: `${w.id}~0`, text: w.text.slice(0, at + 1) };
      const b = { ...w, id: `${w.id}~1`, text: w.text.slice(at + 1) };
      split.add(a.id); split.add(b.id);
      return [a, b];
    });
  }
  const cls = (t: number) => (t >= 1 ? 1 : 0);
  const rows: StackRow<W>[] = [];
  let cur: W[] = [];
  let curTier = 0;
  const flush = () => { if (cur.length) rows.push({ words: cur, tier: curTier }); cur = []; curTier = 0; };
  for (const w of words) {
    const t = tierOf(w);
    if (cur.length) {
      const change = cls(t) !== cls(curTier);
      const full = cur.length >= per;
      const pair = !!opts.heroPair && t === 1 && curTier >= 2 && cur.length === 1 && !full
        && !split.has(w.id) && !split.has(cur[0].id) && cur[0].text.length + w.text.length + 1 <= 11;
      if ((change || full || t >= 2 || curTier >= 2) && !pair) flush();
    }
    cur.push(w);
    curTier = Math.max(curTier, t);
  }
  flush();
  return rows;
}

/** The size multiplier for a row: its tier's entry, the last entry standing in past the table. */
export function stackRowScale(rowScale: number[], tier: number): number {
  return rowScale[Math.min(tier, rowScale.length - 1)] ?? 1;
}
