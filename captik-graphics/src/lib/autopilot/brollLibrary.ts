import { cleanBrollTags } from './brollVocabulary';
// B-ROLL LIBRARY — the cutaway stops being "another moment of the same talking head".
//
// shotPlan.ts made inserts expressible using the clip itself, which is what a creator
// cutting their own footage does. It is not what the reference reels do: they cut to a
// SUBJECT — cash being counted, a phone screen, a city street — chosen to match the
// sentence being spoken. Without a library every insert is the same face, so the edit has
// structure but nothing to say.
//
// This module owns WHICH clip a moment wants. The catalogue itself is ingested by
// scripts/broll_ingest.mjs and served from the existing CloudFront library bucket.
//
// LICENSING, because it constrains the design: Pexels and Pixabay both permit commercial
// use with no attribution, and both FORBID redistributing the clips as a standalone stock
// library. Compositing them into a user's video is squarely allowed; exposing a browsable
// "download our b-roll" gallery is not. So clips are only ever reachable as part of a
// render, never as a listable asset endpoint. `credit` is carried anyway — not required,
// but cheap to keep and it makes an audit trivial.

export interface BrollClip {
  id: string;
  /** CDN url of the encoded clip. */
  url: string;
  durMs: number;
  w: number;
  h: number;
  /** Semantic tags, lowercased. */
  tags: string[];
  /** Primary bucket — one of BROLL_TOPICS. */
  topic: string;
  /** How much the frame moves; a static plate under a caption reads better than a whip pan. */
  motion: 'static' | 'slow' | 'fast';
  source: 'pexels' | 'pixabay';
  credit: string;
}

/** Topic → the words in a transcript that should summon it.
 *
 *  Deliberately concrete. A generic "business" bucket produces the stock-video look people
 *  mock; "cash being counted" when the speaker says a number does not. Ordered so the
 *  specific topics win ties over the atmospheric ones. */
export const BROLL_TOPICS: Record<string, readonly string[]> = {
  money:        ["money", "cash", "rupees", "rupee", "dollar", "paid", "pay", "payment", "price", "lakh", "crore", "salary", "income", "earn", "earning", "profit", "revenue", "budget", "invest", "bank", "rich", "wealth"],
  deal:         ["deal", "contract", "negotiate", "offer", "sign", "signed", "agreement", "terms", "client", "sponsor", "sponsorship", "collab", "collaboration", "partner", "partnership"],
  analytics:    ["growth", "graph", "chart", "data", "analytics", "numbers", "metric", "metrics", "stats", "views", "reach", "engagement", "impressions", "percent", "conversion"],
  startup:      ["startup", "founder", "company", "venture", "scale", "scaling", "launch", "product", "saas", "pitch", "investor", "funding"],
  shopping:     ["shop", "shopping", "buy", "order", "delivery", "package", "store", "retail", "cart", "checkout", "ecommerce"],
  crypto:       ["crypto", "bitcoin", "blockchain", "token", "wallet", "trading", "trade", "stocks", "market", "portfolio"],
  laptop:       ["laptop", "computer", "typing", "email", "desk", "code", "coding", "software", "website", "online", "developer", "programming"],
  phone:        ["phone", "mobile", "app", "scroll", "scrolling", "swipe", "notification", "screen", "texting"],
  social:       ["instagram", "reel", "reels", "tiktok", "youtube", "post", "feed", "follower", "followers", "subscriber", "subscribers", "viral", "algorithm", "dm"],
  ai:           ["ai", "robot", "automation", "machine", "chatgpt", "prompt", "neural", "tech", "technology", "future"],
  office:       ["office", "meeting", "team", "coworking", "colleague", "workplace", "boss", "manager"],
  studio:       ["camera", "filming", "shoot", "shooting", "content", "creator", "record", "recording", "studio", "edit", "editing", "lighting", "podcast"],
  crowd:        ["people", "audience", "crowd", "everyone", "community", "viewers", "public", "event", "conference"],
  alone:        ["alone", "solitude"],
  happy:        ["happy", "smile", "laugh", "joy", "celebrate", "celebration", "proud"],
  stress:       ["stress", "stressed", "anxiety", "pressure", "overwhelm", "burnout", "tired", "exhausted", "struggle"],
  focus:        ["routine", "checklist"],
  confidence:   ["confident"],
  gym:          ["gym", "workout", "fitness", "training", "lift", "weights", "muscle", "exercise", "reps"],
  running:      ["run", "running", "jog", "marathon", "sprint", "cardio"],
  food:         ["food", "eat", "lunch", "dinner", "cooking", "restaurant", "meal", "recipe", "kitchen"],
  coffee:       ["coffee", "chai", "tea", "espresso", "brew"],
  sleep:        ["sleep", "rest", "bed", "dream", "recovery", "wake"],
  nature:       ["nature", "forest", "tree", "mountain", "green", "outdoor", "hike", "park"],
  ocean:        ["ocean", "sea", "wave", "water", "swim", "surf", "island"],
  sky:          ["sky", "clouds", "sunset", "sunrise", "stars", "space", "horizon"],
  rain:         ["rain", "storm", "weather", "monsoon", "thunder"],
  city:         ["city", "street", "traffic", "road", "town", "building", "urban", "downtown", "skyline"],
  india:        ["india", "mumbai", "delhi", "bangalore", "indian", "desi", "hyderabad", "pune", "chennai"],
  travel:       ["travel", "flight", "airport", "trip", "journey", "hotel", "vacation", "abroad", "passport", "luggage"],
  driving:      ["drive", "driving", "car", "bike", "ride", "riding", "highway", "commute"],
  train:        ["train", "metro", "subway", "station", "bus", "transport"],
  books:        ["book", "books", "read", "reading", "study", "learn", "learning", "library", "notebook"],
  writing:      ["write", "writing", "pen", "journal", "diary", "handwritten", "letter", "draft"],
  clock:        ["time", "clock", "hour", "minute", "deadline", "late", "early", "schedule", "calendar"],
  keys:         ["key", "keys", "unlock", "access", "entry"],
  tools:        ["tool", "tools", "workshop", "craft"],
  art:          ["art", "paint", "draw", "drawing", "design", "creative", "sketch", "colour", "color"],
  music:        ["music", "song", "sound", "audio", "beat", "guitar", "listen"],
  fashion:      ["fashion", "clothes", "style", "outfit", "wear", "shirt", "shoes", "dress"],
  fire:         ["fire", "burn", "flame", "hot", "heat", "spark", "ignite"],
  light:        ["neon", "lamp", "flare"],
  dark:         ["darkness", "shadow", "silhouette"],
  speed:        ["speeding", "timelapse"],
  slow:         ["meditation", "stillness"],
  growthplant:  ["grow", "growing", "plant", "seed", "root", "bloom", "flower", "garden"],
  broken:       ["broken", "cracked", "shatter"],
  repair:       ["repair", "rebuild", "toolbox"],
  door:         ["door", "doorway", "staircase"],
  crowdcheer:   ["applause", "cheering", "fans"],
  handshake:    ["handshake"],
  target:       ["target", "finish", "goal"],
  question:     ["confused", "puzzled"],
  idea:         ["idea", "lightbulb"],
  phonecall:    ["call", "talk", "speak", "conversation", "voice"],
  document:     ["document", "paper", "file", "form", "report", "print"],
  security:     ["security", "safe", "protect", "lock", "private", "risk", "danger"],
  family:       ["family", "home", "parent", "mother", "father", "kid", "child", "house"],
  school:       ["school", "college", "student", "class", "teacher", "exam", "degree", "education"],
  health:       ["health", "medical", "hospital", "sick", "medicine", "care", "body"],
  server:       ["server", "datacenter", "datacentre", "hosting", "cloud", "infrastructure"],
  trophy:       ["trophy", "award", "winner", "won", "champion", "medal"],
  microphone:   ["mic", "microphone"],
  beach:        ["beach", "shore", "sand", "seaside", "coast"],
  clinic:       ["clinic", "doctor", "checkup", "stethoscope", "patient"],
  paint:        ["painting", "brush", "canvas", "artist"],
  headphones:   ["headphone", "headphones", "earphones", "earbuds"],
  stage:        ["stage", "auditorium", "keynote", "perform", "performance"],
  cafe:         ["cafe", "coffeeshop", "barista"],
  cardpayment:  ["contactless", "terminal", "pos", "debit"],
  warehouse:    ["warehouse", "logistics", "inventory", "shipping", "fulfilment", "fulfillment"],
};

/** Ingest queries per topic. Portrait-first, since every output is 9:16. */
export const BROLL_QUERIES: Record<string, readonly string[]> = {
  money:        ["counting money", "cash rupees", "money stack", "wallet cash", "atm card"],
  deal:         ["business handshake", "signing contract", "meeting agreement", "office negotiation"],
  analytics:    ["charts screen", "stock chart", "data dashboard", "graph growth"],
  startup:      ["startup office", "team whiteboard", "pitch presentation", "coworking startup"],
  shopping:     ["online shopping", "delivery package", "retail store", "unboxing product"],
  crypto:       ["crypto trading screen", "bitcoin coin", "trading charts", "stock market screen"],
  laptop:       ["typing laptop", "laptop desk work", "coding screen", "hands keyboard"],
  phone:        ["scrolling phone", "smartphone hand", "phone screen closeup", "texting phone"],
  social:       ["social media phone", "instagram scrolling", "influencer filming", "phone notifications"],
  ai:           ["artificial intelligence", "robot arm", "server room", "circuit board macro"],
  office:       ["team meeting office", "office discussion", "coworking space", "office desk"],
  studio:       ["camera filming", "video studio light", "vlogging camera", "microphone podcast"],
  crowd:        ["crowd people walking", "audience concert", "busy street crowd", "conference audience"],
  alone:        ["person alone window", "solitude walking", "quiet room person"],
  happy:        ["people laughing", "celebration confetti", "friends smiling", "cheering success"],
  stress:       ["stressed person desk", "head in hands", "tired late night work"],
  focus:        ["focused working", "writing notes closeup", "deep work desk"],
  confidence:   ["confident portrait", "walking confident", "standing strong"],
  gym:          ["gym workout", "lifting weights", "fitness training", "dumbbell closeup"],
  running:      ["running morning", "sunrise run", "jogging road", "sprint track"],
  food:         ["cooking food", "restaurant meal", "chopping vegetables", "plating dish"],
  coffee:       ["coffee pour", "cafe table", "chai tea", "espresso machine"],
  sleep:        ["sleeping bed", "night bedroom", "waking up morning"],
  nature:       ["nature forest", "trees walking", "mountain hike", "green leaves"],
  ocean:        ["ocean waves", "beach sunset", "underwater sea", "surfing"],
  sky:          ["clouds timelapse", "sunset sky", "night stars", "sunrise horizon"],
  rain:         ["rain window", "rain street", "storm clouds", "monsoon rain"],
  city:         ["city street night", "traffic timelapse", "city skyline", "walking street"],
  india:        ["india street", "mumbai city", "indian market", "delhi traffic"],
  travel:       ["airport terminal", "airplane window", "road trip drive", "suitcase travel"],
  driving:      ["driving car pov", "motorbike ride", "highway driving", "car dashboard"],
  train:        ["train station", "metro subway", "train window view", "bus city"],
  books:        ["reading book", "library books", "studying desk", "turning pages"],
  writing:      ["writing notebook", "pen paper closeup", "journal writing", "handwriting"],
  clock:        ["clock ticking", "hourglass sand", "calendar pages", "watch closeup"],
  keys:         ["keys door", "unlocking door", "opening door light"],
  tools:        ["workshop tools", "building hands", "repairing", "craftsman working"],
  art:          ["painting canvas", "drawing sketch", "artist studio", "paint brush"],
  music:        ["playing guitar", "headphones music", "studio mixing", "vinyl record"],
  fashion:      ["clothing rack", "fashion walking", "folding clothes", "sneakers closeup"],
  fire:         ["fire flames", "sparks slow motion", "bonfire night", "burning paper"],
  light:        ["neon light", "light beam dark", "lamp glow", "sun flare"],
  dark:         ["dark room silhouette", "shadow wall", "night dark street"],
  speed:        ["fast traffic timelapse", "running fast motion", "speeding car"],
  slow:         ["slow motion water", "calm lake", "breathing meditation"],
  growthplant:  ["plant growing timelapse", "seedling soil", "watering plant", "flower bloom"],
  broken:       ["broken glass", "falling object", "cracked wall", "torn paper"],
  repair:       ["fixing tools", "solving puzzle", "rebuilding", "cleaning up"],
  door:         ["opening door", "crossroads road", "staircase up"],
  crowdcheer:   ["crowd cheering", "applause hands", "fans celebrating"],
  handshake:    ["handshake closeup", "agreement meeting", "two people talking"],
  target:       ["dartboard target", "archery aim", "finish line", "checklist done"],
  question:     ["confused person", "question mark", "thinking puzzled"],
  idea:         ["lightbulb idea", "brainstorm notes", "eureka moment"],
  phonecall:    ["phone call talking", "video call laptop", "headset talking"],
  document:     ["signing documents", "stack of papers", "printing paper"],
  security:     ["padlock security", "cctv camera", "safe lock", "fingerprint scan"],
  family:       ["family home", "parents child", "family dinner", "home living room"],
  school:       ["classroom students", "college campus", "studying exam", "graduation"],
  health:       ["doctor patient", "hospital corridor", "medical checkup"],
  // third ingest — subjects the tag census showed the library still had almost none of
  server:       ["server room", "data centre racks", "network cables", "server lights"],
  trophy:       ["trophy award", "winner medal", "celebration trophy", "award ceremony"],
  microphone:   ["podcast microphone closeup", "studio mic", "recording microphone", "mic stand"],
  beach:        ["beach waves", "sand shore", "seaside walk", "tropical beach"],
  clinic:       ["doctor clinic", "medical checkup", "stethoscope closeup", "hospital corridor"],
  paint:        ["painting canvas", "paint brush closeup", "artist studio", "colour mixing"],
  headphones:   ["headphones closeup", "wearing headphones", "studio headphones", "listening music"],
  stage:        ["concert stage", "speaker on stage", "stage lights", "auditorium stage"],
  cafe:         ["cafe interior", "coffee shop table", "barista counter", "cafe window seat"],
  cardpayment:  ["card payment terminal", "tap to pay", "credit card swipe", "contactless payment"],
  warehouse:    ["warehouse shelves", "logistics warehouse", "forklift boxes", "storage racks"],
};

const WORD = /[a-z0-9]+/g;

/** Score every topic against a stretch of transcript. Higher = better match. */
/** A spoken figure — "6k", "2 lakh", "300", "10x" — is about money far more often than
 *  not, and none of them appeared in the keyword lists, so a sentence whose whole point was
 *  a number resolved to no topic at all. */
const FIGURE = /^\d+(k|m|x|cr|l)?$/;

export function scoreTopics(text: string): { topic: string; score: number }[] {
  const words = (text.toLowerCase().match(WORD) ?? []);
  if (!words.length) return [];
  const counts = new Map<string, number>();
  for (const w of words) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
    // Count the stem too. The keyword lists are written in the base form, so "sleeping" found
    // nothing while ten clips of someone asleep sat in the library — the footage was there,
    // the word just did not match. Cheap suffix stripping, not a real stemmer: enough to join
    // running/runs to run without turning "keys" into "key" being wrong anywhere it matters.
    const stem = w.replace(/(ing|ed|es|s)$/, '');
    if (stem.length > 2 && stem !== w) counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  const figures = words.filter((w) => FIGURE.test(w)).length;
  return Object.entries(BROLL_TOPICS)
    .map(([topic, keys]) => ({
      topic,
      score: keys.reduce((n, k) => n + (counts.get(k) ?? 0), 0)
        + (topic === 'money' ? figures : 0),
    }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic));
}

/** The topic a moment wants, or null when the line says nothing concrete.
 *
 *  Returning null matters: a cutaway to a random "business" clip because the sentence
 *  contained no imageable noun is exactly the stock-footage slop this is meant to avoid.
 *  No match → shotPlan falls back to a self-insert, which is always honest. */
export function topicFor(text: string): string | null {
  return scoreTopics(text)[0]?.topic ?? null;
}

export interface PickOptions {
  /** Clip ids already used in this render — never repeat one in a single video. */
  used?: ReadonlySet<string>;
  /** Minimum clip length needed to cover the insert. */
  minDurMs?: number;
  /** Prefer a calm frame when the insert sits under a caption. */
  preferStill?: boolean;
}

/**
 * Pick the best clip for a topic.
 *
 * Portrait wins over landscape (every output is 9:16 and a landscape clip has to be
 * centre-cropped to a third of its width), a clip long enough to cover the insert wins over
 * one that would have to loop, and an unused clip always beats a repeat.
 */
export function pickClip(
  catalogue: readonly BrollClip[],
  topic: string,
  opts: PickOptions = {},
): BrollClip | null {
  const { used = new Set<string>(), minDurMs = 2000, preferStill = false } = opts;
  const pool = catalogue.filter((c) => c.topic === topic && !used.has(c.id));
  if (!pool.length) return null;
  const scored = pool.map((c) => {
    let s = 0;
    if (c.h > c.w) s += 40;                        // portrait
    if (c.durMs >= minDurMs) s += 30;              // covers the insert without looping
    if (preferStill && c.motion !== 'fast') s += 12;
    if (c.motion === 'slow') s += 6;               // slow push reads best under type
    s += Math.min(10, c.h / 200);                  // gentle nudge toward higher resolution
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id));
  return scored[0].c;
}

/** Convenience: the clip a stretch of speech wants, or null to fall back to a self-insert. */
/**
 * TAGS FIRST, KEYWORDS ONLY AS A FALLBACK.
 *
 * The keyword route can only answer at the granularity of a topic — ask for "money" and you
 * get whichever of forty money clips comes first, with no way to say you wanted hands counting
 * cash rather than a bank tower. It also drifted: about forty-five keyword buckets pointed at
 * topics holding no footage at all, and four topics holding 48 clips had no keyword pointing
 * at them, so 8% of the library was unreachable.
 *
 * Now every clip carries tags from a closed vocabulary and the planner is given that
 * vocabulary, so a query is usually just tags and the lookup is an exact match. Anything that
 * still arrives as prose falls through to the old topic scoring, which is what keeps older
 * plans and hand-typed queries working.
 */
export function brollFor(
  catalogue: readonly BrollClip[],
  text: string,
  opts: PickOptions = {},
): BrollClip | null {
  const asked = cleanBrollTags((text.toLowerCase().match(/[a-z-]+/g) ?? []));
  if (asked.length) {
    const hit = pickByTags(catalogue, asked, opts);
    if (hit) return hit;
  }
  /**
   * Try the topics in order of how well they scored, not just the winner.
   *
   * A bucket with no footage behind it used to swallow the query outright: "doctor hospital"
   * scored `clinic` and `health` equally, the tie broke alphabetically to the one with no
   * clips, and the answer was nothing at all — while a shelf of hospital footage sat next to
   * it. Falling through costs nothing and makes an empty bucket harmless, which matters most
   * right after an ingest adds keywords ahead of the clips they point at.
   */
  for (const { topic } of scoreTopics(text)) {
    const clip = pickClip(catalogue, topic, opts);
    if (clip) return clip;
  }
  return null;
}

/**
 * The best clip for a set of tags.
 *
 * Every asked-for tag the clip carries is worth more than any production quality, so a clip
 * that is literally of the thing beats a prettier clip that merely shares its mood. Below
 * that, the same preferences pickClip uses — a clip that cannot cover the insert, or that
 * whip-pans under a caption, is still the wrong clip.
 */
export function pickByTags(
  catalogue: readonly BrollClip[],
  tags: readonly string[],
  opts: PickOptions = {},
): BrollClip | null {
  const { used = new Set<string>(), minDurMs = 2000, preferStill = false } = opts;
  const want = new Set(tags);
  const scored = catalogue
    .filter((c) => !used.has(c.id))
    .map((c) => {
      const matched = (c.tags ?? []).filter((t) => want.has(t)).length;
      if (!matched) return null;
      let s = matched * 100;
      if (c.h > c.w) s += 40;
      if (c.durMs >= minDurMs) s += 30;
      if (preferStill && c.motion !== 'fast') s += 12;
      if (c.motion === 'slow') s += 6;
      return { c, s };
    })
    .filter((x): x is { c: BrollClip; s: number } => x !== null);

  if (!scored.length) return null;
  scored.sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id));
  return scored[0].c;
}
