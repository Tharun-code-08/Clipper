// IMPORTER: malloy-render Remotion compositions -> Captik graphics templates.
//
// Sources of truth, both machine-readable, which is why this can be automated safely:
//   - src/chunks/*/Root.tsx  : per composition — id, fps, width, height, durationInFrames and
//                              defaultProps as literal JSON (the real defaults).
//   - src/templates/<id>.tsx : the component + its zod schema, whose `.describe("kind")` markers
//                              say how each field should be edited.
//
// It writes:
//   src/lib/graphics/malloy/templates/<id>.tsx   the component, imports rewritten to our shims
//   src/lib/graphics/malloy/index.ts             the adapted registrations
//
// Usage: node scripts/import_malloy.mjs [--limit N] [--chunks 0,1,2]

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = 'C:/malloy-render';
const OUT_DIR = resolve('src/lib/graphics/malloy/templates');
const INDEX = resolve('src/lib/graphics/malloy/index.ts');

const argLimit = Number((process.argv.find((a) => a.startsWith('--limit')) ?? '').split('=')[1] ?? 0);
const argChunks = (process.argv.find((a) => a.startsWith('--chunks')) ?? '').split('=')[1];

mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Read every chunk Root.tsx: composition metadata + defaultProps JSON.
// ─────────────────────────────────────────────────────────────────────────────
function readCompositions() {
  const out = [];
  const chunkDirs = readdirSync(join(SRC, 'src/chunks')).filter((d) => d.startsWith('chunk-'));
  const wanted = argChunks ? new Set(argChunks.split(',').map((n) => `chunk-${String(n).padStart(3, '0')}`)) : null;
  for (const dir of chunkDirs) {
    if (wanted && !wanted.has(dir)) continue;
    const rootPath = join(SRC, 'src/chunks', dir, 'Root.tsx');
    if (!existsSync(rootPath)) continue;
    const src = readFileSync(rootPath, 'utf8');

    // import C12 from '../../templates/componentname-2';
    const fileOf = new Map();
    for (const m of src.matchAll(/import\s+(C\d+)\s+from\s+['"][^'"]*\/templates\/([^'"]+)['"]/g)) {
      fileOf.set(m[1], m[2]);
    }

    // <Composition id={"x"} component={C0 as never} durationInFrames={240} fps={30}
    //              width={1920} height={1080} defaultProps={{...} as never} />
    const re = /<Composition\s+id=\{"([^"]+)"\}\s+component=\{(C\d+)[^}]*\}\s+durationInFrames=\{(\d+)\}\s+fps=\{(\d+)\}\s+width=\{(\d+)\}\s+height=\{(\d+)\}\s+defaultProps=\{([\s\S]*?)\s+as never\}/g;
    for (const m of src.matchAll(re)) {
      let defaults = {};
      try { defaults = JSON.parse(m[7].trim()); } catch { /* keep {} — schema defaults still apply */ }
      out.push({
        id: m[1], file: fileOf.get(m[2]), durationInFrames: +m[3], fps: +m[4],
        width: +m[5], height: +m[6], defaults, chunk: dir,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Parse the zod schema's TOP-LEVEL fields (brace/paren aware — nested
//    z.array(z.object({...})) must not be split on its inner commas).
// ─────────────────────────────────────────────────────────────────────────────
function schemaBody(src) {
  const i = src.search(/export const \w+Schema\s*=\s*z\.object\(\{/);
  if (i < 0) return null;
  const start = src.indexOf('{', src.indexOf('z.object(', i));
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(start + 1, j);
    }
  }
  return null;
}

function splitFields(body) {
  const parts = [];
  let depth = 0, cur = '', inStr = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) { cur += c; if (c === inStr && body[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    if (c === '}' || c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** The field's OWN kind marker. A list field contains its items' markers too —
 *  `z.array(z.object({ name: z.string().describe("text") })).describe("list")` — and the first
 *  match is the INNER one, which silently turned lists into plain text params and handed the
 *  component a string where it destructured an array. The outer chain always closes last. */
const KIND = (expr) => {
  const all = [...expr.matchAll(/\.describe\(\s*["']([a-z]+)["']\s*\)/g)];
  return all.length ? all[all.length - 1][1] : undefined;
};

function numRange(expr) {
  const min = (expr.match(/\.min\((-?[\d.]+)\)/) || [])[1];
  const max = (expr.match(/\.max\((-?[\d.]+)\)/) || [])[1];
  const step = (expr.match(/\.multipleOf\((-?[\d.]+)\)/) || [])[1];
  return { min: min !== undefined ? +min : 0, max: max !== undefined ? +max : 100, step: step !== undefined ? +step : 1 };
}

/** Array item shape for a `list` field: z.array(z.object({a: z.string(), b: z.number()})) */
function listSpec(key, expr) {
  const inner = expr.match(/z\.array\(\s*z\.object\(\{([\s\S]*?)\}\)\s*\)/);
  if (!inner) return { key, fields: [], numeric: [] };
  const fields = [], numeric = [];
  for (const f of splitFields(inner[1])) {
    const name = (f.match(/^([A-Za-z_]\w*)\s*:/) || [])[1];
    if (!name) continue;
    fields.push(name);
    if (/z\.number\(/.test(f)) numeric.push(name);
  }
  return { key, fields, numeric };
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');

function buildParams(comp, src) {
  const body = schemaBody(src);
  const params = [];
  const lists = [];
  const known = new Set();
  if (body) {
    for (const field of splitFields(body)) {
      const key = (field.match(/^([A-Za-z_]\w*)\s*:/) || [])[1];
      if (!key) continue;
      known.add(key);
      const kind = KIND(field);
      const dflt = comp.defaults[key];
      // Skip the two props our own instance controls already own.
      if (key === 'transparentBackground') continue;

      if (kind === 'color') {
        let v = typeof dflt === 'string' ? dflt : '#FFFFFF';
        // Our colour control is a 6-digit hex picker; rgba()/8-digit defaults are passed
        // through as fixed props instead of being silently truncated to the wrong colour.
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) continue;
        params.push(`{ type: 'color', key: '${key}', label: '${label(key)}', group: 'Style', default: '${v}' }`);
      } else if (kind === 'text' || kind === 'textarea') {
        const v = typeof dflt === 'string' ? dflt : '';
        const ml = kind === 'textarea' ? ', multiline: true' : '';
        params.push(`{ type: 'text', key: '${key}', label: '${label(key)}', group: 'Content', default: '${esc(v)}', maxLength: ${kind === 'textarea' ? 400 : 120}${ml} }`);
      } else if (kind === 'bool' || kind === 'toggle' || kind === 'checkbox') {
        params.push(`{ type: 'boolean', key: '${key}', label: '${label(key)}', group: 'Style', default: ${dflt === true} }`);
      } else if (kind === 'slider' || kind === 'number') {
        const r = numRange(field);
        let v = typeof dflt === 'number' ? dflt : r.min;
        v = Math.min(r.max, Math.max(r.min, v));
        params.push(`{ type: 'number', key: '${key}', label: '${label(key)}', group: 'Motion', default: ${v}, min: ${r.min}, max: ${r.max}, step: ${r.step} }`);
      } else if (kind === 'dropdown' || kind === 'select') {
        const en = field.match(/z\.enum\(\[([^\]]*)\]\)/);
        const opts = en ? en[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
        if (opts.length < 2) continue;              // our select needs >= 2 real options
        const v = typeof dflt === 'string' && opts.includes(dflt) ? dflt : opts[0];
        params.push(`{ type: 'select', key: '${key}', label: '${label(key)}', group: 'Style', default: '${esc(v)}', options: [${opts.map((o) => `{ value: '${esc(o)}', label: '${esc(o)}' }`).join(', ')}] }`);
      } else if (kind === 'image') {
        params.push(`{ type: 'image', key: '${key}', label: '${label(key)}', group: 'Content', default: '' }`);
      } else if (kind === 'list') {
        const spec = listSpec(key, field);
        const rows = Array.isArray(dflt) ? dflt : [];
        // A row whose cell is itself an array/object cannot be written as `a | b | c` — flattening
        // it would show the user "[object Object]" and feed the component garbage. Those lists
        // stay at their authored defaults (passed through as a fixed prop) so the template still
        // renders correctly; only genuinely flat lists become editable.
        const nested = rows.some((r) => r && typeof r === 'object'
          && Object.values(r).some((v) => v !== null && typeof v === 'object'));
        if (nested || (rows.length && !spec.fields.length && rows.some((r) => typeof r === 'object'))) {
          continue;   // falls through to fixedProps below, keeping the original array intact
        }
        const text = rows.map((r) => (spec.fields.length
          ? spec.fields.map((f) => String(r?.[f] ?? '')).join(' | ')
          : String(r))).join('\n');
        const help = spec.fields.length ? `One per line: ${spec.fields.join(' | ')}` : 'One per line';
        params.push(`{ type: 'text', key: '${key}', label: '${label(key)}', group: 'Content', multiline: true, maxLength: 900, default: '${esc(text)}', help: '${esc(help)}' }`);
        lists.push(spec);
      }
    }
  }
  // Anything in defaultProps the schema does not expose still has to reach the component.
  const fixed = {};
  for (const [k, v] of Object.entries(comp.defaults)) {
    if (!params.some((p) => p.includes(`key: '${k}'`)) && k !== 'transparentBackground') fixed[k] = v;
  }
  return { params, lists, fixed };
}

const label = (key) => {
  const s = key.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim();
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 32);
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Category heuristic — imported ids carry no category, so classify by name.
// ─────────────────────────────────────────────────────────────────────────────
/** Google family -> the font id our app loads (mirrors malloy/googleFonts.ts MAPPED). Drives the
 *  export font-warm set, so an imported template never paints its first frames in a fallback. */
const FONT_ID = {
  Inter: 'inter', Montserrat: 'montserrat', Anton: 'anton', PlayfairDisplay: 'playfair',
  Poppins: 'poppins', OpenSans: 'opensans', Rubik: 'rubik', LuckiestGuy: 'luckiest',
};

// ─── Category classifier ─────────────────────────────────────────────────────────────────────
// The first pass matched keywords against the ID ALONE and dropped HALF the library (696 of
// 1399) into the 'fx' catch-all: charts, counters, money and explainers all landed there because
// their ids say "inflectionpoints" or "costcascade". This version reads the signals that
// actually describe a template — its schema FIELD NAMES ("chartColor", "metrics", "phoneColor"),
// its DEFAULT COPY, and what its source literally draws — and scores every category, rather
// than taking the first regex that happens to hit.
//
// Weights reflect how much each signal is worth: an id/name hit is deliberate naming, a field
// name is structural, and source text is weakest (a chart template still mentions "text").
const RULES = [
  ['chart',  /\b(chart|graph|plot|axis|bar ?chart|piechart|donut|histogram|scatter|analytic|metric|kpi|dashboard|funnel|gauge|diagram|flow|node|network|pipeline|process|cycle|hierarchy|venn|matrix|quadrant|heatmap|datapoint|dataset|percentage|progress|counter|tally|score ?board|leaderboard|ranking|statistic|survey|poll|census|population|distribution|correlation|trend ?line|growth ?curve|conversion|retention|inflection|inflectionpoint)\b/],
  ['money',  /\b(money|cash|currency|dollar|euro|rupee|price|pricing|revenue|profit|margin|invoice|receipt|payout|payment|bank|wallet|crypto|bitcoin|coin|token|salary|wage|earning|income|sales|roi|budget|spend|cost|expense|fee|discount|refund|subscription|billing|mortgage|loan|debt|interest|investment|portfolio|stock|ticker|market ?value|valuation|funding|fundrais)\b/],
  ['device', /\b(phone|iphone|android|mobile|screen|browser|laptop|desktop|macbook|imac|monitor|device|window|terminal|console|keyboard|tablet|ipad|watch|mockup|app ?store|operating ?system|dashboard ?ui|admin ?panel|settings|toggle ?switch|slider ?ui|file ?manager|folder|finder|widget)\b/],
  ['social', /\b(social|instagram|tiktok|twitter|x ?post|youtube|linkedin|facebook|snapchat|discord|slack|whatsapp|telegram|reddit|follower|following|subscriber|like|heart|comment|dm|direct ?message|chat|messenger|profile|avatar|feed|reel|story ?frame|hashtag|viral|influencer|creator|podcast|spotify|music ?player|playlist|stream)\b/],
  ['notify', /\b(notif|alert|toast|popup|pop ?up|banner|warning|caution|danger|error|reminder|ping|badge|snackbar|announce|breaking|urgent|siren|emergency|status ?bar|lock ?screen)\b/],
  ['cta',    /\b(button|cta|call ?to ?action|click|tap|press|subscribe ?button|sign ?up|signup|register|checkout|cart|shop|buy|order|purchase|link|swipe|download|install|join|book ?now|get ?started|promo|offer|deal|sale|upsell|coupon|voucher|giveaway|raffle|prize|advert|\bad\b|ads|campaign)\b/],
  ['story',  /\b(story|chapter|narrative|journal|diary|letter|memo|document|paper|note|book|page|checklist|check ?list|todo|task|step|stage|roadmap|milestone|agenda|plan|guide|tutorial|explain|explainer|lesson|course|quote|testimonial|review|faq|question|answer|quiz|definition|fact|tip|rule|recipe|timeline ?of|history|before ?after|comparison|versus|\bvs\b|pros ?cons)\b/],
  ['title',  /\b(title|headline|heading|typograph|type ?writer|word|letter|caption|subtitle|lower ?third|intro|outro|logo|wordmark|brand|name ?tag|kinetic ?text|text ?reveal|text ?animation|slogan|tagline|credits)\b/],
  ['fx',     /\b(transition|wipe|glitch|distort|particle|confetti|sparkle|glow|bloom|flare|light ?leak|lens|shadow|smoke|fire|flame|water|liquid|ripple|wave|blur|zoom ?effect|shake|mask ?reveal|reveal ?effect|overlay ?effect|ambient|atmosphere|background ?anim|gradient ?mesh|noise|grain|vignette|cinematic|film ?burn|vhs|retro ?effect|neon ?glow|aurora|firefl|meadow|sky|cloud|rain|snow)\b/],
];

/** Field names are structural evidence: a schema with `chartColor`/`metrics` IS a chart, whatever
 *  its id says. Kept separate (and weighted higher than prose) for exactly that reason. */
const FIELD_HINTS = [
  ['chart',  /\b(chart|bar|graph|axis|metric|datapoint|dataset|series|value|percent|progress|count|total|score|rank|node|step|stage|segment|slice)\w*\b/],
  ['money',  /\b(price|amount|cost|revenue|profit|currency|dollar|salary|budget|invoice|payment)\w*\b/],
  ['social', /\b(username|handle|avatar|follower|like|comment|caption|profile|subscriber)\w*\b/],
  ['device', /\b(screen|phone|device|browser|url|window|app|battery|wifi|signal)\w*\b/],
  ['cta',    /\b(button|cta|badge ?text|offer|discount|promo|coupon)\w*\b/],
  ['story',  /\b(question|answer|quote|author|chapter|paragraph|body ?text|item|task|todo)\w*\b/],
];

/** Last resort for the several hundred templates auto-named `componentname_17`, which carry no
 *  name signal at all. Their PARAM SHAPE still says a lot: a numeric/list-heavy schema is a
 *  chart, a text-heavy one is prose, and a colour-only one is decoration. Guessing from shape
 *  beats dumping everything into one bucket, which is what both earlier passes did. */
function categoryByShape(params) {
  const n = (t) => params.filter((p) => p.includes(`type: '${t}'`)).length;
  const texts = n('text'), nums = n('number'), colors = n('color'), imgs = n('image');
  const lists = params.filter((p) => p.includes('multiline: true')).length;
  if (lists >= 1 && (nums >= 1 || lists >= 2)) return 'chart';
  if (nums >= 3 && texts <= 2) return 'chart';
  if (imgs >= 2) return 'social';
  if (texts >= 4) return 'story';
  if (texts >= 1 && colors <= 4) return 'title';
  if (colors >= 3 && texts === 0) return 'fx';
  return 'title';
}

/** Categories decided by LOOKING at each template (scripts/vision_categorize.mjs renders them and
 *  asks a vision model what they depict). Authoritative where present: heuristics read names and
 *  field lists, which is guesswork for a library that is largely auto-named. */
const VISION = existsSync(resolve('scripts/vision_categories.json'))
  ? JSON.parse(readFileSync(resolve('scripts/vision_categories.json'), 'utf8'))
  : {};

/** Sound cues per template, derived by scripts/gen_malloy_sfx.mjs from each template's own motion
 *  anchors + what it depicts. Kept in a sidecar for the same reason as the categories: a re-import
 *  regenerates every file, and neither the cues nor the categories can be re-derived from the
 *  vendor source alone. Regenerate with `node scripts/gen_malloy_sfx.mjs` after an import. */
const SFX = existsSync(resolve('scripts/malloy_sfx.json'))
  ? JSON.parse(readFileSync(resolve('scripts/malloy_sfx.json'), 'utf8'))
  : {};

const sfxLine = (id) => {
  const c = SFX[id];
  if (!c?.length) return '';
  const body = c.map((x) => `{ atMs: ${x.atMs}, id: '${x.id}', gain: ${x.gain} }`).join(', ');
  return `\n    sfx: () => ([${body}]),`;
};

function categoryFor(id, name, fieldNames, defaultsText, source, params) {
  const idHay = `${id} ${name}`.toLowerCase().replace(/[_-]+/g, ' ');
  const fieldHay = fieldNames.join(' ').replace(/([A-Z])/g, ' $1').toLowerCase();
  const proseHay = `${defaultsText} ${source.slice(0, 9000)}`.toLowerCase();
  // `componentname_12` and friends are placeholder names — treat them as no name at all rather
  // than letting "component" match anything.
  const named = !/^(ml_)?componentname/.test(id);

  const score = {};
  for (const [cat, re] of RULES) {
    let s = 0;
    if (named && re.test(idHay)) s += 12;                            // deliberate naming
    if (re.test(fieldHay)) s += 6;                                   // structural: what it takes
    const hits = (proseHay.match(new RegExp(re.source, 'g')) || []).length;
    s += Math.min(2, hits * 0.35);                                   // capped: prose is noisy
    score[cat] = (score[cat] ?? 0) + s;
  }
  for (const [cat, re] of FIELD_HINTS) {
    if (re.test(fieldHay)) score[cat] = (score[cat] ?? 0) + 7;
  }

  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  // Require real evidence. Below that, the schema's SHAPE decides — never a blanket default,
  // which is how 'fx' swallowed 696 templates and then 'title' swallowed 569.
  if (!ranked.length || ranked[0][1] < 6) return categoryByShape(params);
  return ranked[0][0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Rewrite the component source for our runtime.
// ─────────────────────────────────────────────────────────────────────────────
/** Delete `const|let|var <Name>Schema = <expr>;` declarations, tracking brackets and strings so a
 *  multi-line z.object({...}) is removed whole rather than truncated mid-literal. */
function stripSchemaDecls(src) {
  const re = /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var)\s+\w*Schema\s*=/g;
  let out = src, m;
  while ((m = re.exec(out))) {
    const start = m.index + (out[m.index] === '\n' ? 1 : 0);
    let i = m.index + m[0].length, depth = 0, str = null;
    for (; i < out.length; i++) {
      const c = out[i];
      if (str) { if (c === str && out[i - 1] !== '\\') str = null; continue; }
      if (c === '"' || c === "'" || c === '`') { str = c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ';' && depth <= 0) { i++; break; }
      else if (c === '\n' && depth <= 0) break;   // declaration without a semicolon
    }
    out = out.slice(0, start) + out.slice(i);
    re.lastIndex = start;
  }
  return out;
}

function transform(src) {
  let out = src;
  const fonts = new Set();

  // remotion -> our shim (context hooks replaced, pure helpers passed through)
  out = out.replace(/from\s+["']remotion["']/g, `from '../remotionShim'`);

  // @remotion/google-fonts/X -> makeLoadFont('X'). A file may load several families, so the
  // shim import is emitted ONCE and the rest become plain consts.
  let fontImportEmitted = false;
  out = out.replace(
    /import\s*\{\s*loadFont(?:\s+as\s+(\w+))?\s*\}\s*from\s*["']@remotion\/google-fonts\/(\w+)["'];?/g,
    (_m, alias, family) => {
      fonts.add(family);
      const decl = `const ${alias || 'loadFont'} = makeLoadFont('${family}');`;
      if (fontImportEmitted) return decl;
      fontImportEmitted = true;
      return `import { makeLoadFont } from '../googleFonts';\n${decl}`;
    },
  );

  // The zod schema is compiled away — its information now lives in our ParamDef[]. Dropping it
  // removes the zod + @remotion/zod-types (and -v3) dependency from every imported file.
  out = out.replace(/import\s*\{[^}]*\}\s*from\s*["']zod(?:\/v\d)?["'];?\s*/g, '');
  out = out.replace(/import\s*\{[^}]*\}\s*from\s*["']@remotion\/zod-types(?:-v\d)?["'];?\s*/g, '');
  // Remove EVERY schema *value* declaration, brace-balanced. Not just the exported one: files
  // also declare item schemas (`const ItemSchema = z.object({…})`) and aliases
  // (`const ComponentNameSchema = OtherSchema;`). Those execute at import time, so a leftover
  // one crashes the whole registry — which is exactly what happened at full scale.
  // Type-position uses (`z.infer<typeof XSchema>`) are erased by the compiler and left alone.
  out = stripSchemaDecls(out);
  // The props type was `z.infer<typeof Schema>`; the schema is gone but the type is referenced
  // throughout each file, so it becomes a permissive alias rather than being deleted.
  out = out.replace(/export type (\w+Props)\s*=\s*z\.infer<[^>]+>;/g,
    'export type $1 = Record<string, any>;');

  // VENDORED CODE HEADER. These files are imported third-party compositions, not our authored
  // source: we rewrite their imports and otherwise leave them exactly as written. Our strict
  // type/lint gates exist to police code WE write — running them over 1400 vendored files would
  // block the build on someone else's style, so the generated copies opt out explicitly.
  const banner = `/* eslint-disable */\n// @ts-nocheck\n// GENERATED by scripts/import_malloy.mjs from the malloy-render library — do not edit.\n// Only the imports are rewritten (remotion frame hooks -> ../remotionShim, google fonts ->\n// ../googleFonts, zod schema removed since its fields now live in the adapter's params).\n`;

  return { out: banner + out, fonts: [...fonts] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Run
// ─────────────────────────────────────────────────────────────────────────────
const comps = readCompositions();
const picked = argLimit ? comps.slice(0, argLimit) : comps;
console.log(`compositions found: ${comps.length}, importing: ${picked.length}`);

const seen = new Set();
const regs = [];
const skipped = [];

// Display names must be unique across the WHOLE picker, so an import cannot shadow one of our
// authored templates in search results. Seed the set with the names we already ship.
const takenNames = new Set();
{
  const dir = resolve('src/lib/graphics/templates');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsx')) continue;
    const m = readFileSync(join(dir, f), 'utf8').match(/^\s*name: '([^']*)'/m);
    if (m) takenNames.add(m[1]);
  }
}
function uniqueName(base) {
  if (!takenNames.has(base)) { takenNames.add(base); return base; }
  for (let n = 2; ; n++) {
    const cand = `${base} ${n}`.slice(0, 40);
    if (!takenNames.has(cand)) { takenNames.add(cand); return cand; }
  }
}

/** Dependencies we deliberately do not pull in for a graphics overlay: a 3D engine, a physics
 *  engine, a competing animation runtime, plus a couple of imports that do not resolve at all in
 *  the source library. ~17 of 1421 templates; skipping them is cheaper and safer than shipping
 *  three.js to every editor session. */
const UNSUPPORTED = /from\s*["'](three|@react-three\/[a-z]+|matter-js|gsap|center|render-core)["']/;

/** Compositions that THROW when rendered with the defaults their own Root.tsx declares — they
 *  read props the schema never describes, so no extraction could supply them. Found by rendering
 *  every import across its whole window (the `imported templates render` invariant keeps this
 *  list honest: adding a broken one back fails the suite). 5 of 1421. */
const BROKEN = new Map([
  ['appleglasscard', 'interpolate inputRange is NaN with declared defaults'],
  ['aichatanimation', 'inputRange not monotonic at the end of its window'],
  ['futuresstoploss', 'reads an undefined prop mid-window'],
  ['monthlyproductsales', 'outputRange is NaN with declared defaults'],
  ['barchart-2', 'outputRange is NaN with declared defaults'],
]);

for (const comp of picked) {
  const srcPath = join(SRC, 'src/templates', `${comp.file}.tsx`);
  if (!comp.file || !existsSync(srcPath)) { skipped.push(`${comp.id}: no source file`); continue; }
  const raw = readFileSync(srcPath, 'utf8');
  const dep = raw.match(UNSUPPORTED);
  if (dep) { skipped.push(`${comp.id}: needs ${dep[1]}`); continue; }
  if (BROKEN.has(comp.id)) { skipped.push(`${comp.id}: ${BROKEN.get(comp.id)}`); continue; }

  let id = `ml_${comp.id.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`.slice(0, 40);
  if (seen.has(id)) { let n = 2; while (seen.has(`${id}_${n}`.slice(0, 40))) n++; id = `${id}_${n}`.slice(0, 40); }
  seen.add(id);

  const { params, lists, fixed } = buildParams(comp, raw);
  const { out, fonts } = transform(raw);
  const modName = id;
  writeFileSync(join(OUT_DIR, `${modName}.tsx`), out);

  const fontIds = [...new Set(fonts.map((f) => FONT_ID[f]).filter(Boolean))];
  regs.push({
    id, modName,
    name: uniqueName(label(comp.id).slice(0, 40)),
    // What the template LOOKS like wins; the heuristic is the fallback for anything the vision
    // pass could not resolve (a blank cell, a dropped batch).
    category: VISION[id] ?? categoryFor(
      comp.id,
      label(comp.id),
      Object.keys(comp.defaults),
      Object.values(comp.defaults).filter((v) => typeof v === 'string').join(' '),
      raw,
      params,
    ),
    w: comp.width, h: comp.height,
    durMs: Math.round((comp.durationInFrames / comp.fps) * 1000),
    params, lists, fixed, fontIds,
  });
}

const header = `// GENERATED by scripts/import_malloy.mjs — do not edit by hand.
// Imported Remotion compositions adapted into Captik graphics templates. Their components live
// in ./templates/ with only their imports rewritten (remotion context hooks -> our shim, google
// fonts -> our stack); every editable field below came from the template's own zod schema, and
// every default from the composition's defaultProps.

import { adaptMalloyTemplate } from './adapt';
import type { GraphicsTemplate } from '@/types/graphics';
${regs.map((r) => `import ${r.modName} from './templates/${r.modName}';`).join('\n')}

export const MALLOY_TEMPLATES: GraphicsTemplate[] = [
${regs.map((r) => `  adaptMalloyTemplate({
    id: '${r.id}',
    name: '${esc(r.name)}',
    category: '${r.category}',
    tags: ['Studio', 'Imported'],
    Comp: ${r.modName} as never,
    design: { w: ${r.w}, h: ${r.h} },
    defaultDurationMs: ${Math.max(1000, Math.min(15000, r.durMs))},
    defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 90 },
    fonts: [${r.fontIds.map((f) => `'${f}'`).join(', ')}],
    params: [
${r.params.map((p) => `      ${p},`).join('\n')}
    ],${sfxLine(r.id)}
    lists: [${r.lists.map((l) => `{ key: '${l.key}', fields: [${l.fields.map((f) => `'${f}'`).join(', ')}], numeric: [${(l.numeric || []).map((f) => `'${f}'`).join(', ')}] }`).join(', ')}],
    fixedProps: ${JSON.stringify(r.fixed)},
  }) as unknown as GraphicsTemplate,`).join('\n')}
];
`;

writeFileSync(INDEX, header);
console.log(`wrote ${regs.length} templates -> ${OUT_DIR}`);
console.log(`params total: ${regs.reduce((n, r) => n + r.params.length, 0)}`);
if (skipped.length) console.log(`skipped ${skipped.length}:\n  ${skipped.slice(0, 10).join('\n  ')}`);
