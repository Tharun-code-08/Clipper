import fs from 'node:fs/promises';
import path from 'node:path';
import { CAPTIK_SRC } from './config.js';
import { callStructured } from './llm.js';
import { clamp } from './util.js';

/** Production master's caption templates, read straight from captik-app's catalogue. */
export async function loadTemplateCatalog() {
  const src = await fs.readFile(path.join(CAPTIK_SRC, 'lib', 'captionStyles.tsx'), 'utf8');
  const re = /id: '([a-z0-9_]+)', name: '([^']+)'(?:, badge: '([^']+)')?, tags: \[([^\]]*)\]/g;
  return [...src.matchAll(re)].map((m) => ({
    id: m[1],
    name: m[2],
    badge: m[3] || null,
    tags: m[4].split(',').map((t) => t.trim().replace(/'/g, '')).filter(Boolean),
  }));
}

// What each template is FOR, where it is known from the catalogue and the templates' own design notes.
const TEMPLATE_NOTES = {
  hormozi: 'green-gradient uppercase Anton; business, money, motivation, hard-hitting advice',
  mrbeast: 'white Luckiest Guy with heavy black outline; fun, entertainment, challenges, comedy',
  mr_beast_2: 'second Mr Beast variant; playful high-energy entertainment',
  captik_glow: 'neon glow on the hero word; modern creator talk, tech, lifestyle',
  captik_shadow: 'bold white with shadow; clean all-rounder for talking heads',
  captik: 'Captik house style; clean bold',
  editor_masala: 'kinetic smart layout, hero word huge with small context words; punchy talking heads, desi creator energy',
  illusion: 'kinetic glitch hero; dramatic reveals, twists',
  aura: 'editorial kinetic with difference-blend highlight; aesthetic, fashion, reflective',
  aura_helvetica: 'Swiss editorial kinetic; premium, design, calm authority',
  big_reveal: 'big title box plus captions; one-idea statements, numbers',
  big_red: 'red kinetic hero; urgent, dramatic, warnings',
  scribble: 'hand-drawn kinetic; casual storytelling, lifestyle',
  archives: 'handwritten archival kinetic; nostalgia, history, memories',
  blockbuster: 'cinematic kinetic; epic stories, movie-style drama',
  journal: 'handwritten Bradley Hand caption with a spoken reveal; personal stories, vulnerability, emotional moments',
  interlock: 'editorial: small caps flow into the hero word; insight, education, premium explainers',
  iman_gadzhi: 'minimal luxury; money, entrepreneurship, calm confidence',
  ali_abdaal: 'friendly clean productivity look; education, study, self-improvement',
  tabahi: 'bold aggressive desi style with shadow; roast, comedy, hype',
  delhi: 'desi street style; Hindi / Hinglish banter',
  seedha_saadha: 'simple straightforward Hindi-friendly style',
  thora_cinematic: 'light cinematic Hindi-friendly style',
  deep_glow: 'deep glow bold; night, moody, music',
  black_punch: 'black punch boxes; bold statements',
  boxed: 'Editing Skool boxed words; tutorials, lists',
  highlighted_word: 'highlighter behind the active word; education, clarity',
  pixelated: 'pixel font; gaming, tech, retro',
  liquid_glass: 'glassy translucent pill; tech, Apple-style polish',
  bubble: 'rounded bubble; soft, friendly, vlogs',
  clean_motion: 'subtle clean motion; interviews, documentary',
  clean_glow: 'soft glow; calm talks',
  captik_clean: 'minimal clean; professional talks',
  captik_word: 'one word at a time; fast pacing',
  prism: 'Devin Jatho style with shadow; creator commentary',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function schemaFor(ids) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['clips'],
    properties: {
      clips: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'captionStyle', 'accentColor', 'captionTextColor', 'captionY', 'captionFontScale', 'captionLines', 'emphasis', 'shakeWords', 'reason'],
          properties: {
            id: { type: 'string' },
            captionStyle: { type: 'string', enum: ids },
            accentColor: { type: 'string', description: '#RRGGBB accent that pops against this footage' },
            captionTextColor: { type: 'string', description: '#RRGGBB main caption colour' },
            captionY: { type: 'integer', description: 'Caption centre, % of frame height from the top' },
            captionFontScale: { type: 'number', description: 'Caption size multiplier' },
            captionLines: { type: 'string', enum: ['single', 'double'] },
            emphasis: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['word', 'scale'],
                properties: { word: { type: 'integer' }, scale: { type: 'number' } },
              },
            },
            shakeWords: { type: 'array', items: { type: 'integer' } },
            reason: { type: 'string' },
          },
        },
      },
    },
  };
}

const SYSTEM = (catalog) => `You are the finishing editor for vertical shorts cut from a long video. Each clip is already chosen,
cut and framed 9:16. You style its captions with the creator app's own caption templates, as a top short-form editor would.

TEMPLATES (use the id):
${catalog.map((t) => `- ${t.id} — ${t.name}${t.badge ? ` [${t.badge}]` : ''}${t.tags.length ? ` (${t.tags.join(', ')})` : ''}${TEMPLATE_NOTES[t.id] ? `: ${TEMPLATE_NOTES[t.id]}` : ''}`).join('\n')}

RULES
1. Match the template to the clip's tone and topic, not to a favourite. Across one video keep a consistent look: at most 3 different templates unless clips differ sharply in tone.
2. Placement comes from the FRAMES: captionY is the caption's vertical centre (% from top). Never cover eyes or mouth. Talking heads usually 68-80; if the face sits low, go high (18-30). Keep 12-88.
3. accentColor must pop against the footage and suit the template; captionTextColor is usually #FFFFFF unless the template/footage needs otherwise.
4. emphasis: the words that carry the line — numbers, names, the punchline, emotional words — at most one per caption line, scale 1.3-1.7. Word indexes refer to the clip's WORDS list.
5. shakeWords: at most 2 per clip, only on real impact moments (a shock, a punchline). Empty is fine.
6. captionLines "single" for punchy pacing, "double" only for dense explainer speech.
7. captionFontScale 1.05-1.35: captions must read at a glance on a phone held at arm's length. Devanagari needs the same size as Latin, not smaller; only go below 1.1 when a template's hero words already fill the width.
8. reason: one sentence on why this look fits this clip.`;

/**
 * Style every clip in one call. clips: [{id, title, format, why, duration, words:[{text}], frames:[{t, file}]}]
 * where frames are jpgs of the FINAL 9:16 framing. Returns {styles: Map(id → style), usage, model, ms}.
 */
export async function directClips(clips, { jobDir, model, onProgress }) {
  const catalog = await loadTemplateCatalog();
  const ids = catalog.map((t) => t.id);
  const content = [];
  for (const c of clips) {
    const words = c.words.map((w, i) => `${i}:${w.text}`).join(' ');
    content.push({ type: 'text', text: `CLIP ${c.id} — "${c.title}" · ${c.format} · ${c.duration}s\nWhy it was picked: ${c.why}\nWORDS: ${words}` });
    for (const f of c.frames) {
      const data = await fs.readFile(path.join(jobDir, f.file));
      content.push({ type: 'text', text: `${c.id} frame at ${f.t.toFixed(1)}s` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') } });
    }
  }
  content.push({ type: 'text', text: `Style all ${clips.length} clips. Return one entry per clip id.` });

  const { data, msg, model: served, ms } = await callStructured({
    system: SYSTEM(catalog),
    content,
    schema: schemaFor(ids),
    model,
    effort: 'medium',
    maxTokens: 16000,
    onProgress,
  });
  const styles = new Map();
  for (const raw of data.clips || []) {
    const clip = clips.find((c) => c.id === raw.id);
    if (clip) styles.set(clip.id, validateStyle(raw, clip, ids));
  }
  return { styles, usage: msg.usage, model: served, ms };
}

/** The validator, not the prompt, owns the limits. */
export function validateStyle(raw, clip, ids) {
  const n = clip.words.length;
  const emphasis = (raw.emphasis || [])
    .filter((e) => Number.isInteger(e.word) && e.word >= 0 && e.word < n)
    .slice(0, Math.max(1, Math.ceil(n / 6)))
    .map((e) => ({ word: e.word, scale: clamp(Number(e.scale) || 1.4, 1.2, 1.8) }));
  return {
    captionStyle: ids.includes(raw.captionStyle) ? raw.captionStyle : 'hormozi',
    accentColor: HEX.test(raw.accentColor) ? raw.accentColor.toUpperCase() : '#C8FF00',
    captionTextColor: HEX.test(raw.captionTextColor) ? raw.captionTextColor.toUpperCase() : '#FFFFFF',
    captionY: clamp(Math.round(Number(raw.captionY) || 75), 12, 88),
    // Measured on a rendered Tabahi clip: 0.9-0.95 read too small on a phone, so the floor is enforced here.
    captionFontScale: clamp(Number(raw.captionFontScale) || 1.15, 0.95, 1.4),
    captionLines: raw.captionLines === 'double' ? 'double' : 'single',
    emphasis,
    shakeWords: [...new Set((raw.shakeWords || []).filter((i) => Number.isInteger(i) && i >= 0 && i < n))].slice(0, 2),
    reason: String(raw.reason || '').slice(0, 300),
  };
}

/** Turn a validated style into the clip's editable Captik state (the same shape the editor and export use). */
export function editStateFor({ words, captionSegments }, style) {
  const emph = new Map(style.emphasis.map((e) => [e.word, e.scale]));
  const shake = new Set(style.shakeWords);
  return {
    words: words.map((w, i) => {
      const styleOverride = {};
      if (emph.has(i)) styleOverride.scale = emph.get(i);
      if (shake.has(i)) styleOverride.animations = { screenShake: true };
      return { ...w, styleOverride };
    }),
    captionSegments,
    captionStyle: style.captionStyle,
    accentColor: style.accentColor,
    captionTextColor: style.captionTextColor,
    captionBox: { xPercent: 50, yPercent: style.captionY, widthPercent: 84 },
    captionFontScale: style.captionFontScale,
    captionLines: style.captionLines,
    segmentBoxOverrides: {},
    segmentStyleOverrides: {},
    segmentFontScaleOverrides: {},
    captionEmphBox: { xPercent: 50, yPercent: 24, widthPercent: 84 },
    emphFontScale: 1,
  };
}
