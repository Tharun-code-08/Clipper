// Browsable metadata for the sound-effects bank: what each sound is called and which shelf it sits
// on. Separate from sfxBank.ts (the audio, code-split) so the picker renders the whole library
// without pulling a byte of audio. Auditioning a sound is what triggers the download.

import { SFX_IDS, type SfxId } from './sfxIds';

export type SfxGroup = 'viral' | 'impact' | 'motion' | 'ui' | 'alert' | 'money' | 'texture' | 'organic';

export const SFX_GROUPS: readonly { key: SfxGroup; label: string }[] = [
  { key: 'viral',   label: 'Viral & Meme' },
  { key: 'impact',  label: 'Impacts' },
  { key: 'motion',  label: 'Whooshes & Transitions' },
  { key: 'ui',      label: 'Clicks & Pops' },
  { key: 'alert',   label: 'Chimes & Alerts' },
  { key: 'money',   label: 'Money & Counters' },
  { key: 'texture', label: 'Digital & Texture' },
  { key: 'organic', label: 'Organic' },
];

/** id → [group, label, extra search words]. Every generated id must be listed (sfx.spec.ts). */
export const SFX_META: Record<SfxId, readonly [SfxGroup, string, string?]> = {
  whoosh: ['motion', 'Whoosh', 'swoosh transition'],
  swish: ['motion', 'Swish', 'swoosh'],
  slam: ['impact', 'Slam', 'hit door'],
  boom: ['impact', 'Boom', 'bass hit cinematic'],
  pop: ['ui', 'Pop', 'bubble'],
  snap: ['ui', 'Snap', 'finger'],
  tick: ['ui', 'Tick', 'clock'],
  type: ['texture', 'Typing', 'keyboard'],
  shutter: ['texture', 'Camera Shutter', 'photo'],
  chime: ['alert', 'Chime', 'notification'],
  glass: ['alert', 'Glass Ting', 'clink'],
  blip: ['ui', 'Blip', 'beep'],
  ignite: ['impact', 'Ignite', 'fire flame'],
  cash: ['money', 'Cash Register', 'ka-ching paisa money'],
  coin: ['money', 'Coin', 'paisa'],
  paper: ['organic', 'Paper Rustle', 'page'],
  riser: ['motion', 'Riser', 'build tension'],
  sweep: ['motion', 'Sweep', 'transition'],
  click_lo: ['ui', 'Click · Low'],
  click_mid: ['ui', 'Click · Mid'],
  click_hi: ['ui', 'Click · High'],
  tick_lo: ['ui', 'Tick · Low'],
  tick_mid: ['ui', 'Tick · Mid'],
  tick_hi: ['ui', 'Tick · High'],
  pop_lo: ['ui', 'Pop · Low'],
  pop_mid: ['ui', 'Pop · Mid'],
  pop_hi: ['ui', 'Pop · High'],
  chime_lo: ['alert', 'Chime · Low'],
  chime_mid: ['alert', 'Chime · Mid'],
  chime_hi: ['alert', 'Chime · High'],
  bell_soft: ['alert', 'Soft Bell', 'ding'],
  confirm: ['alert', 'Confirm', 'success correct'],
  deny: ['alert', 'Deny', 'error wrong'],
  toggle_on: ['ui', 'Toggle On', 'switch'],
  toggle_off: ['ui', 'Toggle Off', 'switch'],
  dial: ['ui', 'Dial', 'rotate knob'],
  swish_xs: ['motion', 'Swish · Tiny'],
  swish_sm: ['motion', 'Swish · Small'],
  swish_lg: ['motion', 'Swish · Large'],
  whoosh_in: ['motion', 'Whoosh In', 'enter'],
  whoosh_out: ['motion', 'Whoosh Out', 'exit'],
  lift: ['motion', 'Lift', 'rise up'],
  drop: ['motion', 'Drop', 'fall down'],
  glitch: ['texture', 'Glitch', 'digital error'],
  data: ['texture', 'Data Burst', 'computer'],
  scan: ['texture', 'Scan', 'scanner'],
  thud: ['impact', 'Thud', 'hit'],
  knock: ['organic', 'Knock', 'door'],
  card: ['organic', 'Card Flick', 'swipe'],
  stamp: ['impact', 'Stamp', 'approved'],
  count_up: ['money', 'Count Up', 'numbers counter'],
  keytap: ['texture', 'Key Tap', 'keyboard'],
  airhorn: ['viral', 'Air Horn', 'meme hype'],
  airhorn_trip: ['viral', 'Air Horn ×3', 'meme hype triple'],
  vine_boom: ['viral', 'Meme Boom', 'dramatic bass'],
  bass_drop: ['viral', 'Bass Drop', 'drop hype'],
  boing: ['viral', 'Boing', 'cartoon spring'],
  slide_up: ['viral', 'Slide Whistle Up', 'cartoon'],
  slide_down: ['viral', 'Slide Whistle Down', 'cartoon fail'],
  sad_trombone: ['viral', 'Sad Trombone', 'fail wah'],
  dun_dun_dun: ['viral', 'Dun Dun Dun', 'dramatic suspense'],
  rimshot: ['viral', 'Rimshot', 'joke badum tss'],
  drumroll: ['viral', 'Drumroll', 'reveal'],
  record_scratch: ['viral', 'Record Scratch', 'stop wait'],
  buzzer: ['viral', 'Wrong Buzzer', 'fail error'],
  censor_beep: ['viral', 'Censor Beep', 'bleep'],
  coin_8bit: ['viral', '8-bit Coin', 'game retro'],
  powerup_8bit: ['viral', '8-bit Power-up', 'game retro level up'],
  fail_8bit: ['viral', '8-bit Fail', 'game over retro'],
  splat: ['viral', 'Splat', 'cartoon'],
  suspense: ['viral', 'Suspense Sting', 'dramatic'],
  crickets: ['viral', 'Crickets', 'awkward silence'],
  applause: ['viral', 'Applause', 'clap crowd'],
};

export interface SfxEntry { id: SfxId; label: string; group: SfxGroup; search: string }

const title = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const SFX_LIBRARY: readonly SfxEntry[] = SFX_IDS.map((id) => {
  const m = SFX_META[id];
  const label = m?.[1] ?? title(id);
  const group = m?.[0] ?? 'ui';
  const groupLabel = SFX_GROUPS.find((g) => g.key === group)?.label ?? '';
  return { id, label, group, search: `${label} ${id.replace(/_/g, ' ')} ${m?.[2] ?? ''} ${groupLabel}`.toLowerCase() };
});

export const SFX_ID_SET: ReadonlySet<string> = new Set(SFX_IDS);

export const sfxLabel = (id: string): string =>
  SFX_LIBRARY.find((e) => e.id === id)?.label ?? title(id);

/** Groups in shelf order, filtered by a free-text query (every word must match). */
export function sfxByGroup(query = ''): { key: SfxGroup; label: string; sounds: SfxEntry[] }[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return SFX_GROUPS
    .map((g) => ({
      ...g,
      sounds: SFX_LIBRARY.filter((e) => e.group === g.key && words.every((w) => e.search.includes(w))),
    }))
    .filter((g) => g.sounds.length > 0);
}
