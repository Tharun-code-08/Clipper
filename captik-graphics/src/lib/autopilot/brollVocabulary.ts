/**
 * THE B-ROLL VOCABULARY — a closed list of words the library is described in.
 *
 * The library was reachable only through twenty topic buckets, each holding up to forty
 * interchangeable clips: ask for "money" and you got whichever of the forty came next, with no
 * way to say you wanted hands counting cash rather than a bank tower. Worse, the query side and
 * the footage side had drifted apart — roughly forty-five keyword buckets pointed at topics
 * with no clips at all (stress, gym, coffee, nature, books, handshake, family, health…), and
 * four topics holding 48 clips had no keyword pointing at them.
 *
 * A CLOSED vocabulary fixes both halves at once. Every clip is tagged from this list and
 * nothing else, so the tags on the footage and the words in a query are drawn from the same
 * well. The planner is handed the list, picks from it, and the lookup is an exact match on a
 * tag — no scoring, no synonyms, no guessing what "hustle" was supposed to mean.
 *
 * Grouped because the groups are how a model is asked to think about a frame: who is in it,
 * what is in it, where it is, how it was shot, what it feels like. Keep it small — a
 * vocabulary nobody can hold in their head gets used inconsistently, by a model as much as by
 * a person.
 */

export const BROLL_VOCAB = {
  /** Who is on screen. */
  who: [
    'hands', 'one-person', 'two-people', 'team', 'crowd', 'face', 'over-shoulder', 'no-people',
    'child', 'family',
  ],
  /**
   * What the frame is actually of. The most useful group by far, and the one that has to grow
   * whenever the library does — a subject the vocabulary cannot name gets tagged "one-person
   * indoors" and becomes unreachable, which is the exact failure this vocabulary was written
   * to end.
   */
  what: [
    'cash', 'coins', 'card-payment', 'phone-screen', 'laptop-screen', 'keyboard', 'chart',
    'notebook', 'documents', 'camera', 'microphone', 'headphones', 'package', 'shopping-bag',
    'food', 'drink', 'car', 'plant', 'whiteboard', 'clock', 'screen-ui', 'robot', 'server',
    'storefront', 'stage',
    // added with the second ingest, which brought 44 new subjects
    'books', 'weights', 'bed', 'water', 'fire', 'sky', 'guitar', 'medical', 'trophy',
    'lightbulb', 'paint', 'tools', 'luggage', 'keys', 'door', 'handshake',
  ],
  /** Where it is. */
  where: [
    'office', 'home-desk', 'cafe', 'street', 'city', 'studio', 'shop', 'warehouse', 'nature',
    'indoors', 'outdoors',
    'gym', 'bedroom', 'classroom', 'clinic', 'beach', 'road', 'airport',
  ],
  /** How it was shot — this decides whether a clip can sit under a caption. */
  how: [
    'close-up', 'wide', 'overhead', 'handheld', 'locked-off', 'timelapse', 'slow-motion',
    'screen-recording',
  ],
  /** What it feels like. */
  mood: [
    'bright', 'dark', 'neon', 'warm', 'cool', 'minimal', 'busy', 'calm', 'fast-paced',
  ],
} as const;

export type BrollVocabGroup = keyof typeof BROLL_VOCAB;

/** Every tag, flat. The tagger and the planner are both held to this. */
export const BROLL_TAGS: readonly string[] = Object.values(BROLL_VOCAB).flat();

const TAG_SET = new Set(BROLL_TAGS);

/** Is this a word from the vocabulary? Used to reject a tagger that invents its own. */
export const isBrollTag = (t: string): boolean => TAG_SET.has(t);

/** Keep only real vocabulary tags, de-duplicated, in vocabulary order. */
export function cleanBrollTags(tags: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const s = typeof t === 'string' ? t.trim().toLowerCase() : '';
    if (s && TAG_SET.has(s)) seen.add(s);
  }
  return BROLL_TAGS.filter((t) => seen.has(t));
}

/** The vocabulary as the prompt shows it — grouped, so the model reads it as a menu. */
export function vocabularyForPrompt(): string {
  return (Object.entries(BROLL_VOCAB) as Array<[BrollVocabGroup, readonly string[]]>)
    .map(([group, tags]) => `  ${group.padEnd(6)} ${tags.join(' ')}`)
    .join('\n');
}
