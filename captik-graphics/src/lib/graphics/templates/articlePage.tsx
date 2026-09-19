// Reference: graphics/newspaper-animation.mp4  (window 840-7680ms, page full ~6520ms)
// An explainer article building itself: kicker, a serif headline with highlighted phrases, body
// paragraphs filling two columns, then a stat row.
//
// Highlights are inline ==markup== rather than a per-template list, so the emphasis moves with the
// copy. Paragraphs arrive one at a time and the columns fill in reading order — left column first,
// then right — which is what the reference does and what stops it looking like two unrelated lists.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax } from '../juice';

const MAX_PARAS = 10;
const MAX_STATS = 4;
const MARK = /(==[^=]+==)/;

export const articlePage = defineGraphicsTemplate({
  id: 'article_page',
  name: 'Article Page',
  category: 'story',
  tags: ['Editorial', 'Explainer', 'Article', 'Luxury'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 7600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'page',     label: 'Page', hideable: false },
    { key: 'kicker',   label: 'Kicker' },
    { key: 'headline', label: 'Headline' },
    { key: 'standfirst', label: 'Standfirst' },
    { key: 'columns',  label: 'Columns' },
    { key: 'stats',    label: 'Stat row' },
  ],

  params: [
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'VOX STYLE EXPLAINER\nMYSURU DASARA FESTIVAL', multiline: true, maxLength: 80 },
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', default: 'Mysuru Dasara: A ==Royal City== in Ritual', maxLength: 90,
      help: 'Wrap a phrase in ==equals== to highlight it.' },
    { type: 'text', key: 'standfirst', label: 'Standfirst', group: 'Content', multiline: true, maxLength: 200,
      default: 'A 10-day celebration where palace, procession, and public memory move as one.' },
    { type: 'text', key: 'body', label: 'Paragraphs', group: 'Content', multiline: true, maxLength: 900,
      default:
        'From the torchlit Palace illumination to the grand Jamboo Savari, Dasara turns Mysuru into a living documentary of power, devotion, and civic choreography.\n'
        + 'The Wodeyar dynasty shaped Dasara as a civic ritual of legitimacy.\n'
        + 'Nine nights honor the goddess Chamundeshwari on the hill above the city.\n'
        + 'Every day has a theme — from royal court to folk arts.\n'
        + 'Markets, craft bazaars, and food streets act as parallel stages.\n'
        + 'Dasara is not just a festival — it is a live broadcast of heritage, power, and public space.\n'
        + 'The Jamboo Savari procession is the cinematic climax.\n'
        + 'A golden howdah carries the idol through a choreographed route.\n'
        + 'Illuminations sync the palace to nightly crowds and drone shots.\n'
        + 'Tourism peaks, but the ritual remains intensely local.',
      help: 'One paragraph per line.' },
    { type: 'text', key: 'stats', label: 'Stats', group: 'Content', maxLength: 160,
      default: '10 DAYS|Ritual Sequence,200+|Cultural Performances,1 CITY|Transformed Nightly',
      help: 'Comma-separated, each "figure|caption".' },

    { type: 'color',  key: 'bg',     label: 'Paper',     group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',    label: 'Text',      group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary', group: 'Style', default: '#8B8778' },
    { type: 'color',  key: 'mark',   label: 'Highlight', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',   label: 'Headline font', group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',   label: 'Headline size', group: 'Style', default: 62, min: 16, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'bodySize', label: 'Body size', group: 'Style', default: 21, min: 8, max: 50, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the paper', group: 'Style', default: true },

    { type: 'number', key: 'headAt',  label: 'Headline at', group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'bodyAt',  label: 'First paragraph at', group: 'Motion', default: 900, min: 0, max: 5000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perPara', label: 'Per paragraph', group: 'Motion', default: 480, min: 40, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'statsAt', label: 'Stats at',   group: 'Motion', default: 5600, min: 0, max: 10000, step: 50, unit: 'ms' },
  ],

  // DOCU whispers: a quiet air pass as the headline racks into focus, a luxe ping when the
  // stat row lands — retiming headAt/statsAt retimes the cues with the build.
  sfx: (p) => [
    { atMs: p.headAt + 120, id: 'whoosh', gain: 0.4 },
    { atMs: p.statsAt + 100, id: 'glass', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const paras = p.body.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_PARAS);
    const stats = p.stats.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_STATS)
      .map((s) => { const [fig = '', cap = ''] = s.split('|').map((x) => x.trim()); return { fig, cap }; });

    const at = (ms: number, dur = 460) => spring({
      frame: fr(timeMs - ms), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(dur))),
    });

    const pad = width * 0.075;
    // Left column fills first, then the right — reading order, not two parallel lists.
    const half = Math.ceil(paras.length / 2);

    // DOCU depth: the page lives in 3D on a slow breath (editorial, not a slam), pushes in
    // Ken-Burns style over the whole window, and the headline arrives as a RACK FOCUS
    // (blur → sharp). Kicker and stat row parallax against the sway so the sheet has layers.
    const pageIn = at(0);
    const pose = depthPose(timeMs, seed, { enter: pageIn, rx: -7, z: -60, swayDeg: 1.2, periodMs: 4800 });
    const push = 1 + Math.min(1, timeMs / Math.max(1, durationMs)) * 0.02;
    const parKick = parallax(timeMs, seed, 0.45, height * 0.006, 4800);
    const parStats = parallax(timeMs, seed, 0.75, height * 0.006, 4800);
    const headSpr = at(p.headAt + 120);
    const focusHead = (1 - Math.min(1, headSpr)) * 5;

    const marked = (text: string, size: number) => text.split(MARK).filter(Boolean).map((part, k) => {
      const on = part.startsWith('==') && part.endsWith('==') && part.length > 4;
      return (
        <span
          key={k}
          style={on ? { background: p.mark, color: '#17130A', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: `0 ${size * 0.06}px` } : undefined}
        >
          {on ? part.slice(2, -2) : part}
        </span>
      );
    });

    const column = (list: string[], offset: number) => (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: p.bodySize * 0.9 }}>
        {list.map((para, i) => {
          const s = at(p.bodyAt + (offset + i) * p.perPara);
          return (
            <div
              key={i}
              style={{
                fontSize: p.bodySize, lineHeight: 1.5, color: p.ink,
                opacity: clamp01(s * 1.6),
                transform: `translateY(${((1 - s) * height * 0.008).toFixed(2)}px)`,
              }}
            >
              {marked(para, p.bodySize)}
            </div>
          );
        })}
      </div>
    );

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          // The page sits on a slightly darker surround, like the reference's desk behind the paper.
          background: p.fill ? `linear-gradient(${rgba('#000000', 0.5)}, ${rgba('#000000', 0.5)}), ${p.bg}` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: fontStack('inter'),
        }}
      >
      <div
        style={{
          width: '100%', height: '88%', overflow: 'hidden',
          background: p.fill
            ? `linear-gradient(180deg, ${rgba('#ffffff', 0.045)} 0%, ${rgba('#000000', 0.35)} 100%), ${p.bg}`
            : 'transparent',
          border: p.fill ? `1px solid ${LUXE.hairline}` : undefined,
          borderRadius: 18,
          boxShadow: p.fill ? `0 ${height * 0.015}px ${height * 0.045}px ${rgba('#000000', 0.5)}, inset 0 1px 0 ${rgba('#ffffff', 0.06)}` : undefined,
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: p.size * 0.28,
          opacity: clamp01(pageIn * 1.6),
          transform: `${pose} scale(${push.toFixed(4)})`,
          transformOrigin: '50% 42%',
          ...el('page'),
        }}
      >
        <div
          style={{
            fontSize: p.size * 0.2, letterSpacing: '0.18em', color: p.dim,
            fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'pre-line', lineHeight: 1.6,
            opacity: clamp01(at(p.headAt) * 1.6),
            transform: `translate(${parKick.x.toFixed(2)}px, ${parKick.y.toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </div>

        <div
          style={{
            fontFamily: ff,
            fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1.12,
            letterSpacing: -p.size * 0.008,
            opacity: clamp01(headSpr * 1.6),
            filter: focusHead > 0.3 ? `blur(${focusHead.toFixed(2)}px)` : undefined,
            transform: `translateY(${((1 - headSpr) * height * 0.012).toFixed(2)}px)`,
            ...el('headline'),
          }}
        >
          {marked(p.headline, p.size)}
        </div>

        <div
          style={{
            fontSize: p.bodySize * 1.14, lineHeight: 1.45, color: p.ink,
            opacity: clamp01(at(p.headAt + 340) * 1.6),
            ...el('standfirst'),
          }}
        >
          {p.standfirst}
        </div>

        <div style={{ display: 'flex', gap: pad * 0.7, flex: 1, minHeight: 0, ...el('columns') }}>
          {column(paras.slice(0, half), 0)}
          {column(paras.slice(half), half)}
        </div>

        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            borderTop: `1px solid ${rgba('#ffffff', 0.14)}`,
            paddingTop: p.size * 0.2,
            opacity: clamp01(at(p.statsAt) * 1.6),
            transform: `translate(${parStats.x.toFixed(2)}px, ${(parStats.y + (1 - at(p.statsAt)) * height * 0.01).toFixed(2)}px)`,
            ...el('stats'),
          }}
        >
          {stats.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: p.bodySize * 0.2 }}>
              <span style={{ fontSize: p.size * 0.32, fontWeight: 700, color: p.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.fig}</span>
              <span style={{ fontSize: p.bodySize * 0.72, color: p.dim, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{s.cap}</span>
            </div>
          ))}
        </div>

      </div>
      {p.fill && <div style={luxeVignette(0.35)} />}
      {p.fill && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
