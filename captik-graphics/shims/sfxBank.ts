// Stand-in for the premium branch's src/lib/graphics/sfxBank.ts.
//
// That file is imported Epidemic Sound audio plus other sound packs whose licences do not cover this repo, so it
// is never copied here (scripts/sync-captik.mjs replaces it, captik/vite-plugin.mjs routes every import to this
// file). Every template's sound cue still plays, license-free:
//   - the 73 sounds Captik SYNTHESIZED with scripts/gen_sfx.mjs (sfxBankLicenseFree.ts: oscillators, filters and
//     noise, no recordings) play as themselves;
//   - every pack id a template cues is voiced by its nearest synthesized sound — by what its name says it is
//     (whoosh, click, cash register, camera…), else by its shelf in SFX_META.
// Swap in a licensed bank with the same ids when real recordings are wanted.
import { SFX_META } from '../src/lib/graphics/sfxMeta';
import { SFX as SYNTHESIZED } from './sfxBankLicenseFree';

const FREE = SYNTHESIZED as Record<string, string>;

const BY_NAME: readonly [RegExp, string][] = [
  [/whoosh|woosh|swoosh|swish|swing|swipe|transition|wind/, 'whoosh'],
  [/riser|build_up|ascending|evolve|swell|power_up|suction/, 'riser'],
  [/bass_drop|drop|subsonic|boom|impact|hit|slam|punch|crash|thud|struck|bone/, 'boom'],
  [/cash|register|kaching|coin|money|racks|ting/, 'cash'],
  [/camera|shutter|flash/, 'shutter'],
  [/type|typing|typewriter|keyboard|keytap|writing|pencil/, 'type'],
  [/glitch|malfunction|hacking|termainal|static|electricity/, 'glitch'],
  [/data|digit|counting|download|transfer|processing|loading|disc_read|network|dial_up|scan/, 'data'],
  [/wrong|denied|fail|buzzer|error|disconnected/, 'deny'],
  [/correct|approve|aproove|granted|confirm|win|prize|good_idea/, 'confirm'],
  [/ding|chime|bell|notification|message|iphone|discord|alert|beacon|idea/, 'chime_mid'],
  [/pop|bloop|bubble|cork/, 'pop_mid'],
  [/tick|clock/, 'tick'],
  [/click|button|select|mouse|menu|interface|switch/, 'click_mid'],
  [/paper|crumpled|flip|ripping|slide_03/, 'paper'],
  [/applause|crowd|yeyy/, 'applause'],
  [/scratch|rewind|fast_forward|tape/, 'record_scratch'],
  [/suspense|spooky|cinematic|sudden|dark/, 'suspense'],
  [/drum/, 'drumroll'],
  [/horn|party/, 'airhorn'],
  [/fart|splat|goofy|boing|cartoon/, 'boing'],
  [/glass|shatter/, 'glass'],
];

const BY_SHELF: Readonly<Record<string, string>> = {
  ui: 'click_mid',
  alert: 'chime_mid',
  impact: 'thud',
  motion: 'whoosh',
  texture: 'data',
  viral: 'vine_boom',
  money: 'cash',
  organic: 'paper',
};

function voiceFor(id: string): string | undefined {
  if (FREE[id]) return FREE[id];
  const byName = BY_NAME.find(([re]) => re.test(id))?.[1];
  const fallback = byName ?? BY_SHELF[SFX_META[id]?.[0] ?? ''];
  return fallback ? FREE[fallback] : undefined;
}

export const SFX: Record<string, string> = Object.fromEntries(
  [...new Set([...Object.keys(SFX_META), ...Object.keys(FREE)])]
    .map((id) => [id, voiceFor(id)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
);
