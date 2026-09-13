import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';

export interface StyleDef {
  id:             CaptionStyleId;
  name:           string;
  badge?:         string;
  tags:           string[];
  previewText:    string;
  textStyle:      React.CSSProperties;
  previewBg?:     string;
  renderPreview?: () => React.ReactNode;
}

export const CAPTION_STYLES: StyleDef[] = [
  // ─── Captik Glow ─────────────────────────────────────────────────────────
  {
    id: 'captik_glow', name: 'Captik Glow', badge: 'Popular', tags: ['Bold', 'Glow'],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#a0d83e', fontWeight: 800, fontSize: 24 },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 500, marginBottom: 4, textShadow: '0 0 8px rgba(160,216,62,0.2)' }}>the quick</div>
        <div style={{ color: '#a0d83e', fontWeight: 800, fontSize: 30, textTransform: 'uppercase', textShadow: '0 0 4px #a0d83e, 0 0 16px rgba(160,216,62,0.8), 0 0 32px rgba(160,216,62,0.45)' }}>BROWN</div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 500, marginTop: 4, textShadow: '0 0 8px rgba(160,216,62,0.2)' }}>fox jumps</div>
      </div>
    ),
  },

  // ─── Ali Abdaal ───────────────────────────────────────────────────────────
  {
    id: 'ali_abdaal', name: 'Ali Abdaal', tags: [],
    previewText: 'the quick fox',
    textStyle: { fontFamily: 'Poppins, sans-serif', color: '#000000', fontWeight: 700, fontSize: 16 },
    previewBg: '#111118',
    renderPreview: () => (
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '7px 12px', display: 'inline-flex', gap: 5, alignItems: 'center', fontFamily: 'Poppins, sans-serif' }}>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500, fontSize: 13 }}>the</span>
        <span style={{ color: '#000', fontWeight: 800, fontSize: 15, background: '#ffffff', padding: '1px 7px', borderRadius: 5 }}>quick</span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500, fontSize: 13 }}>fox</span>
      </div>
    ),
  },

  // ─── Captik Shadow ────────────────────────────────────────────────────────
  {
    id: 'captik_shadow', name: 'Captik Shadow', badge: 'New', tags: ['Bold'],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 800, fontSize: 24 },
    renderPreview: () => {
      const fade: React.CSSProperties = { backgroundImage: 'linear-gradient(to bottom,rgba(255,255,255,0.38),rgba(110,110,110,0.38))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
      const main: React.CSSProperties = { backgroundImage: 'linear-gradient(to bottom,#ffffff 0%,#ffffff 40%,#848484 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
      return (
        <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
          <div style={{ ...fade, fontSize: 11, marginBottom: 4 }}>the quick</div>
          <div style={{ ...main, fontWeight: 800, fontSize: 31 }}>BROWN</div>
          <div style={{ ...fade, fontSize: 11, marginTop: 4 }}>fox jumps</div>
        </div>
      );
    },
  },

  // ─── Captik ───────────────────────────────────────────────────────────────
  {
    id: 'captik', name: 'Captik', tags: [],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#C8FF00', fontWeight: 800, fontSize: 22 },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 500, marginBottom: 4 }}>the quick</div>
        <div style={{ color: '#C8FF00', fontWeight: 900, fontSize: 31, lineHeight: 1, textTransform: 'uppercase' }}>BROWN</div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 500, marginTop: 4 }}>fox jumps</div>
      </div>
    ),
  },

  // ─── Clean Motion ─────────────────────────────────────────────────────────
  {
    id: 'clean_motion', name: 'Clean Motion', tags: [],
    previewText: 'brown',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 500, fontSize: 20 },
    renderPreview: () => (
      <div style={{ fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 23, letterSpacing: '-0.01em' }}>brown</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 3 }}>one word at a time</div>
      </div>
    ),
  },

  // ─── Bubble Style ─────────────────────────────────────────────────────────
  {
    id: 'bubble', name: 'Bubble Style', tags: [],
    previewText: 'the quick fox',
    textStyle: { fontFamily: '"Times New Roman", serif', color: '#ffffff', fontWeight: 600, fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', fontFamily: '"Times New Roman", serif' }}>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>the</span>
        <span style={{ background: '#48A680', color: '#000', fontWeight: 700, fontSize: 14, padding: '2px 9px', borderRadius: 8 }}>quick</span>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>fox</span>
      </div>
    ),
  },

  // ─── Hormozi ──────────────────────────────────────────────────────────────
  {
    id: 'hormozi', name: 'Hormozi Style', badge: 'Popular', tags: ['Bold'],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Anton, sans-serif', color: '#a5fd4b', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' },
    renderPreview: () => {
      const grad: React.CSSProperties = {
        backgroundImage: 'linear-gradient(to bottom,#77a748 0%,#97DE25 35%,#a5fd4b 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        fontFamily: 'Anton, sans-serif', fontWeight: 700, textTransform: 'uppercase' as const,
      };
      return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center' }}>
          <span style={{ ...grad, fontSize: 13 }}>THE</span>
          <span style={{ ...grad, fontSize: 32 }}>BROWN</span>
          <span style={{ ...grad, fontSize: 13 }}>FOX</span>
        </div>
      );
    },
  },

  // ─── Editing Skool (boxed) ────────────────────────────────────────────────
  {
    id: 'boxed', name: 'Editing Skool', tags: ['Bold'],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 700, fontSize: 20, textTransform: 'uppercase' },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, marginBottom: 6 }}>the quick</div>
        <div style={{ background: '#f48601', borderRadius: 5, padding: '6px 22px', display: 'inline-block' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 24, textTransform: 'uppercase', letterSpacing: '0.04em' }}>BROWN</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, marginTop: 6 }}>fox jumps</div>
      </div>
    ),
  },

  // ─── Mr Beast Style 1 ─────────────────────────────────────────────────────
  {
    id: 'mrbeast', name: 'Mr Beast Style 1', tags: ['Bold', 'Shadow'],
    previewText: 'BROWN',
    textStyle: { fontFamily: '"Luckiest Guy", cursive', color: '#ffffff', fontWeight: 900, fontSize: 22, textTransform: 'uppercase' },
    renderPreview: () => {
      const sm = '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000';
      const lg = '-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 -3px 0 #000,0 3px 0 #000,-3px 0 0 #000,3px 0 0 #000';
      return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center' }}>
          <span style={{ fontFamily: '"Luckiest Guy", cursive', color: '#fff', fontWeight: 900, fontSize: 14, textTransform: 'uppercase', textShadow: sm }}>THE</span>
          <span style={{ fontFamily: '"Luckiest Guy", cursive', color: '#fff', fontWeight: 900, fontSize: 32, textTransform: 'uppercase', textShadow: lg }}>BROWN</span>
          <span style={{ fontFamily: '"Luckiest Guy", cursive', color: '#fff', fontWeight: 900, fontSize: 14, textTransform: 'uppercase', textShadow: sm }}>FOX</span>
        </div>
      );
    },
  },

  // ─── Mr Beast Style 2 ─────────────────────────────────────────────────────
  {
    id: 'mr_beast_2', name: 'Mr Beast Style 2', tags: ['Bold', 'Shadow'],
    previewText: 'BROWN',
    textStyle: { color: '#FFD700', fontWeight: 900, fontSize: 18, textShadow: '0 4px 8px rgba(0,0,0,0.9)' },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', fontFamily: 'Futura,"Century Gothic",sans-serif' }}>THE</span>
        <span style={{ color: '#FFD700', fontWeight: 900, fontSize: 27, textTransform: 'uppercase', fontFamily: 'Futura,"Century Gothic",sans-serif', textShadow: '0 4px 12px rgba(0,0,0,0.9)' }}>BROWN</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', fontFamily: 'Futura,"Century Gothic",sans-serif' }}>FOX</span>
      </div>
    ),
  },

  // ─── Iman Gadzhi ─────────────────────────────────────────────────────────
  {
    id: 'iman_gadzhi', name: 'Iman Gadzhi', tags: [],
    previewText: 'THE QUICK BROWN',
    textStyle: { color: '#ffffff', fontWeight: 600, fontSize: 20 },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'MonaSans, Montserrat, sans-serif' }}>
        <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em' }}>THE QUICK</div>
        <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>BROWN FOX</div>
      </div>
    ),
  },

  // ─── Devin Jatho (prism) ──────────────────────────────────────────────────
  {
    id: 'prism', name: 'Devin Jatho', tags: ['Shadow'],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#A34EFF', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', fontFamily: 'Montserrat, sans-serif' }}>
        <span style={{ color: 'rgba(163,78,255,0.35)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>THE</span>
        <span style={{ color: '#A34EFF', fontWeight: 700, fontSize: 28, textTransform: 'uppercase', letterSpacing: '0.03em' }}>BROWN</span>
        <span style={{ color: 'rgba(163,78,255,0.35)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>FOX</span>
      </div>
    ),
  },

  // ─── Highlighted Word ─────────────────────────────────────────────────────
  {
    id: 'highlighted_word', name: 'Highlighted Word', tags: ['Bold'],
    previewText: 'the quick fox',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#fff', fontWeight: 600, fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', justifyContent: 'center', fontFamily: 'Montserrat, sans-serif' }}>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 17 }}>the</span>
        <span style={{ color: '#F5A623', fontWeight: 700, fontSize: 23 }}>quick</span>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 17 }}>fox</span>
      </div>
    ),
  },

  // ─── Clean Glow ───────────────────────────────────────────────────────────
  {
    id: 'clean_glow', name: 'Clean Glow Style', tags: ['Shadow'],
    previewText: 'the quick brown fox',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 19, textShadow: '0px 0px 14px rgba(255,255,255,0.9)' },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
        <div style={{ color: '#ffffff', fontWeight: 400, fontSize: 17, textShadow: '0 0 16px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.7)' }}>the quick brown fox</div>
        <div style={{ color: '#ffffff', fontWeight: 400, fontSize: 17, textShadow: '0 0 16px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.7)', marginTop: 7 }}>jumps over</div>
      </div>
    ),
  },

  // ─── Captik Clean ─────────────────────────────────────────────────────────
  {
    id: 'captik_clean', name: 'Captik Clean', tags: [],
    previewText: 'the quick brown fox',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 19, textShadow: '1px 1px 2px rgba(0,0,0,0.3)' },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 400, fontSize: 17 }}>the quick brown fox</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 400, fontSize: 17, marginTop: 7 }}>jumps over</div>
      </div>
    ),
  },

  // ─── Black Punch ──────────────────────────────────────────────────────────
  {
    id: 'black_punch', name: 'Black Punch', tags: ['Bold'],
    previewText: 'BROWN',
    textStyle: { fontFamily: 'Anton, sans-serif', color: '#000000', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' },
    previewBg: '#c2c2c2',
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Anton, sans-serif', lineHeight: 1 }}>
        <div style={{ color: 'rgba(0,0,0,0.28)', fontSize: 10, marginBottom: 6 }}>the quick</div>
        <div style={{ color: '#000', fontWeight: 700, fontSize: 30, textTransform: 'uppercase', WebkitTextStroke: '0.3px rgba(60,60,60,0.6)' }}>BROWN</div>
        <div style={{ color: 'rgba(0,0,0,0.28)', fontSize: 10, marginTop: 6 }}>fox jumps</div>
      </div>
    ),
  },

  // ─── Captik Word ──────────────────────────────────────────────────────────
  {
    id: 'captik_word', name: 'Captik Word', tags: [],
    previewText: '',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#fff', fontWeight: 700, fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 17 }}>the</span>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 17 }}>quick</span>
        <span style={{ color: 'rgba(255,255,255,0.18)', fontWeight: 600, fontSize: 17 }}>brown</span>
      </div>
    ),
  },

  // ─── Pixelated Word ───────────────────────────────────────────────────────
  {
    id: 'pixelated', name: 'Pixelated Word', tags: [],
    previewText: 'BROWN',
    textStyle: { color: '#ffffff', fontWeight: 400, fontSize: 18, fontFamily: 'monospace' },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'monospace', lineHeight: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, letterSpacing: '0.18em', marginBottom: 7 }}>THE_QUICK</div>
        <div style={{ color: '#ffffff', fontWeight: 400, fontSize: 24, letterSpacing: '0.06em' }}>BROWN</div>
      </div>
    ),
  },

  // ─── Liquid Glass ─────────────────────────────────────────────────────────
  {
    id: 'liquid_glass', name: 'Liquid Glass', tags: [],
    previewText: 'yeh scene hai',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 300 },
    previewBg: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)',
    renderPreview: () => (
      <div style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 50, padding: '6px 18px', display: 'inline-flex', gap: 5, backdropFilter: 'blur(10px)', fontFamily: 'Montserrat, sans-serif' }}>
        <span style={{ color: '#857e6e', fontWeight: 300, fontSize: 14 }}>the</span>
        <span style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 400, fontSize: 14 }}>quick</span>
        <span style={{ color: '#857e6e', fontWeight: 300, fontSize: 14 }}>fox</span>
      </div>
    ),
  },

  // ─── Tabahi ───────────────────────────────────────────────────────────────
  {
    id: 'tabahi', name: 'Tabahi', tags: ['Bold', 'Shadow'],
    previewText: 'THE QUICK',
    textStyle: { color: '#ffffff', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', WebkitTextStroke: '0.066em black' as string },
    renderPreview: () => {
      const outline = '-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 3px 0 #000,3px 0 0 #000,0 -3px 0 #000,-3px 0 0 #000';
      return (
        <div style={{ textAlign: 'center', lineHeight: 1 }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 23, textTransform: 'uppercase', WebkitTextStroke: '0.066em black', textShadow: outline, fontFamily: 'KomikaAxis,"Comic Sans MS",cursive' }}>THE QUICK</div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 17, textTransform: 'uppercase', WebkitTextStroke: '0.066em black', textShadow: outline, fontFamily: 'KomikaAxis,"Comic Sans MS",cursive', opacity: 0.72, marginTop: 7 }}>BROWN FOX</div>
        </div>
      );
    },
  },

  // ─── Deep Glow ────────────────────────────────────────────────────────────
  {
    id: 'deep_glow', name: 'Deep Glow', tags: ['Bold', 'Shadow'],
    previewText: 'BROWN FOX',
    textStyle: { color: 'rgba(255,255,255,0.8)', fontWeight: 900, fontSize: 18, textTransform: 'uppercase', textShadow: '0 0 10px #FF00FF,0 0 20px #FF00FF,0 0 30px #FF00FF' },
    renderPreview: () => {
      const glow = '0 0 10px #FF00FF, 0 0 24px #FF00FF, 0 0 42px #FF00FF';
      return (
        <div style={{ textAlign: 'center', lineHeight: 1 }}>
          <div style={{ color: '#FF00FF', fontWeight: 900, fontSize: 26, textTransform: 'uppercase', textShadow: glow, fontFamily: 'TheBoldFont, Anton, Impact, sans-serif', letterSpacing: '0.03em' }}>BROWN FOX</div>
          <div style={{ color: '#FF00FF', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', textShadow: '0 0 8px rgba(255,0,255,0.55)', fontFamily: 'TheBoldFont, Anton, Impact, sans-serif', opacity: 0.42, marginTop: 7 }}>JUMPS OVER</div>
        </div>
      );
    },
  },

  // ─── Seedha Saadha ────────────────────────────────────────────────────────
  {
    id: 'seedha_saadha', name: 'Seedha Saadha', tags: ['Shadow'],
    previewText: 'BROWN',
    textStyle: { color: '#ffffff', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', WebkitTextStroke: '0.085em black' as string },
    previewBg: '#000000',
    renderPreview: () => {
      const outline = '-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 3px 0 #000,3px 0 0 #000,0 -3px 0 #000,-3px 0 0 #000';
      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 36, textTransform: 'uppercase', WebkitTextStroke: '0.085em black', textShadow: outline, fontFamily: 'RubikBlack, Rubik, sans-serif', lineHeight: 1 }}>BROWN</div>
        </div>
      );
    },
  },

  // ─── Thora Cinematic ──────────────────────────────────────────────────────
  {
    id: 'thora_cinematic', name: 'Thora Cinematic', tags: [],
    previewText: 'BROWN FOX',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#ffffff', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.3em' },
    previewBg: 'rgba(14,22,38,0.95)',
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Montserrat, sans-serif', lineHeight: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8, letterSpacing: '0.38em', textTransform: 'uppercase', marginBottom: 7 }}>THE QUICK</div>
        <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.34em' }}>BROWN FOX</div>
      </div>
    ),
  },

  // ─── Delhi ────────────────────────────────────────────────────────────────
  {
    id: 'delhi', name: 'Delhi', tags: [],
    previewText: '',
    textStyle: { fontFamily: '"Instrument Sans", sans-serif', color: '#fff', fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'InstrumentSans,"Instrument Sans",sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 15 }}>the</span>
        <span style={{ fontFamily: 'InstrumentSerifItalic,"Instrument Serif",serif', color: '#ffffff', fontWeight: 400, fontSize: 19, fontStyle: 'italic', textShadow: '0 0 16px rgba(255,255,255,0.75)' }}>quick</span>
        <span style={{ fontFamily: 'InstrumentSans,"Instrument Sans",sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 15 }}>fox</span>
      </div>
    ),
  },

  // ─── Illusion ─────────────────────────────────────────────────────────────
  {
    id: 'illusion', name: 'Illusion', badge: 'New', tags: ['Bold', 'Kinetic'],
    previewText: 'Biggest',
    textStyle: { fontFamily: "'Open Sans', sans-serif", color: '#ffffff', fontWeight: 700, fontSize: 14 },
    renderPreview: () => (
      <div style={{ fontFamily: "'Open Sans', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 'max-content' }}>
        <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 10, lineHeight: 1, textAlign: 'center' }}>he had rented the</div>
        <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 28, lineHeight: 0.85, textAlign: 'center' }}>Biggest</div>
        <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 10, lineHeight: 1, textAlign: 'center' }}>apartment in town</div>
      </div>
    ),
  },

  // ─── Editor Masala ────────────────────────────────────────────────────────
  {
    id: 'editor_masala', name: 'Editor Masala', badge: 'Smart', tags: ['Bold', 'Kinetic', 'Smart'],
    previewText: 'PROCESS',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#FFD700', fontWeight: 900, fontSize: 26 },
    renderPreview: () => (
      <div style={{ fontFamily: 'Montserrat, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: 'max-content', lineHeight: 0.8 }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 12, lineHeight: 0.9, textAlign: 'center', letterSpacing: '0.01em' }}>trust the</div>
        <div style={{ color: '#FFD700', fontWeight: 900, fontSize: 34, lineHeight: 0.8, textAlign: 'center', textShadow: '0 0 1px rgba(0,0,0,0.35)' }}>PROCESS</div>
      </div>
    ),
  },

  // ─── Aura ─────────────────────────────────────────────────────────────────
  {
    id: 'aura', name: 'Aura', badge: 'Editorial', tags: ['Bold', 'Kinetic'],
    previewText: 'forget',
    textStyle: { fontFamily: '"Playfair Display", serif', color: '#ffffff', fontStyle: 'italic', fontWeight: 600, fontSize: 26 },
    renderPreview: () => (
      // cursive feature word + heavy bold key word with the cyan 'difference' highlight tint.
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.82, padding: '6px 4px' }}>
        <span style={{ fontFamily: '"Playfair Display", "InstrumentSerifItalic", "Georgia", serif', fontStyle: 'italic', fontWeight: 600, fontSize: 30, color: '#ffffff' }}>forget</span>
        <span style={{ fontFamily: '"TheBoldFont", "Anton", sans-serif', fontWeight: 900, fontSize: 23, color: '#7fd3ff', textTransform: 'uppercase', letterSpacing: '0.01em', marginTop: -2 }}>STATUS</span>
      </div>
    ),
  },

  // ─── Swiss ────────────────────────────────────────────────────────────────
  // Aura's editorial role-engine (same tiers, positions, diagonal splash) in ONE super-bold
  // Helvetica-grotesque face — no cursive serif/italic/rotation, words reveal as spoken.
  {
    id: 'aura_helvetica', name: 'Swiss', badge: 'Editorial', tags: ['Bold', 'Kinetic'],
    previewText: 'FOCUS',
    textStyle: { fontFamily: '"HelveticaBold", "Helvetica Neue", Helvetica, Arial, sans-serif', color: '#ffffff', fontWeight: 900, fontSize: 26 },
    renderPreview: () => (
      // single Helvetica-black face; roles differ by SIZE only (big feature word + key word).
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.82, padding: '6px 4px', fontFamily: '"HelveticaBold", "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
        <span style={{ fontWeight: 900, fontSize: 30, color: '#ffffff' }}>focus</span>
        <span style={{ fontWeight: 900, fontSize: 23, color: '#F5D300', textTransform: 'uppercase', letterSpacing: '0.01em', marginTop: -2 }}>DEEPLY</span>
      </div>
    ),
  },

  // ─── Big Reveal ───────────────────────────────────────────────────────────
  // Emphasised words form a big yellow TITLE that sits behind the subject (cut out across the
  // whole video); non-emphasised words read as a normal caption below. The thumbnail shows the
  // subject's head overlapping the lower half of the title.
  {
    id: 'big_reveal', name: 'Big Reveal', badge: 'New', tags: ['Bold', 'Kinetic'],
    previewText: 'HELLO',
    textStyle: { fontFamily: '"TheBoldFont", "Anton", sans-serif', color: '#FFE800', fontWeight: 900, fontSize: 28, textTransform: 'uppercase' },
    renderPreview: () => (
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'max-content', lineHeight: 0.85 }}>
        <span style={{ fontFamily: '"TheBoldFont", "Anton", sans-serif', fontWeight: 900, fontSize: 30, color: '#FFE800', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>HELLO</span>
        {/* subject's head, cut out OVER the lower half of the title */}
        <div style={{ position: 'absolute', top: 17, left: '50%', transform: 'translateX(-50%)', width: 24, height: 24, borderRadius: '50%', background: '#2b2b2b' }} />
        <span style={{ fontFamily: '"Open Sans", sans-serif', fontWeight: 700, fontSize: 11, color: '#ffffff', marginTop: 7, position: 'relative' }}>guys.</span>
      </div>
    ),
  },

  // ─── The Big Red ──────────────────────────────────────────────────────────
  // Big Reveal's two-box lockup with NO subject cut-out: the emphasised words become a huge
  // vertically-stretched Times New Roman title in red (lowest layer) and the rest of the line reads
  // as a plain white Times caption straight across its middle (topmost layer).
  {
    id: 'big_red', name: 'The Big Red', badge: 'New', tags: ['Bold', 'Kinetic'],
    previewText: 'SECOND',
    textStyle: { fontFamily: '"TimesNewRomanBold","Times New Roman",Times,serif', color: '#D53E3E', fontWeight: 700, fontSize: 26, textTransform: 'uppercase' },
    renderPreview: () => (
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'max-content', padding: '10px 2px', fontFamily: '"TimesNewRomanBold","Times New Roman",Times,serif' }}>
        <span style={{
          display: 'inline-block', fontWeight: 700, fontSize: 33, lineHeight: 1,
          textTransform: 'uppercase', transform: 'scaleY(1.35)',
          backgroundImage: 'linear-gradient(90deg,#C9302F 0%,#D53E3E 18%,#E68C8C 50%,#D53E3E 82%,#C9302F 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent',
          filter: 'drop-shadow(0 0 5px rgba(150,15,15,0.55))',
        }}>SECOND</span>
        {/* the non-emphasised words, dead centre and in FRONT of the title */}
        <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontWeight: 700, fontSize: 12, color: '#ffffff', whiteSpace: 'nowrap' }}>the quick fox</span>
      </div>
    ),
  },

  // ─── Scribble ─────────────────────────────────────────────────────────────
  // Hand-journal stickers: Caveat handwriting, words pop in like stickers (seeded rotation),
  // the key word gets a yellow highlighter swipe (dark ink on the marker) and the emphasised
  // word gets a red-pen circle that draws itself on. Thumbnail = the settled lockup.
  {
    id: 'scribble', name: 'Scribble', badge: 'New', tags: ['Kinetic', 'Handwritten'],
    previewText: 'little',
    textStyle: { fontFamily: '"Caveat","Segoe Print","Comic Sans MS",cursive', color: '#ffffff', fontWeight: 700, fontSize: 22 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center', fontFamily: '"Caveat","Segoe Print","Comic Sans MS",cursive', fontWeight: 700, padding: '6px 2px' }}>
        <span style={{ color: '#FDFAF3', fontSize: 15, display: 'inline-block', transform: 'rotate(-2deg)', textShadow: '0 1px 4px rgba(30,20,10,0.55)' }}>the</span>
        <span style={{ position: 'relative', display: 'inline-block', transform: 'rotate(1.5deg)' }}>
          <span aria-hidden style={{ position: 'absolute', top: '6%', bottom: '-2%', left: '-6%', right: '-8%', background: 'linear-gradient(94deg, rgba(255,224,66,0.94) 0%, rgba(255,214,40,0.86) 55%, rgba(255,228,90,0.92) 100%)', borderRadius: '8px 14px 10px 12px / 14px 8px 13px 9px', transform: 'skewX(-5deg)' }} />
          <span style={{ position: 'relative', color: '#241C12', fontSize: 21 }}>little</span>
        </span>
        <span style={{ position: 'relative', display: 'inline-block', transform: 'rotate(-1deg)' }}>
          <span style={{ color: '#FDFAF3', fontSize: 15, textShadow: '0 1px 4px rgba(30,20,10,0.55)' }}>things</span>
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: 'absolute', top: '-16%', left: '-12%', width: '124%', height: '132%', overflow: 'visible' }}>
            <ellipse cx={50} cy={30} rx={46} ry={25} transform="rotate(-3 50 30)" style={{ fill: 'none', stroke: '#FF5D5D', strokeWidth: 3, strokeLinecap: 'round', strokeDasharray: 100, strokeDashoffset: 12 }} pathLength={100} />
          </svg>
        </span>
      </div>
    ),
  },

  // ─── Archives ─────────────────────────────────────────────────────────────
  // Hand-drawn animated lettering: a brush-script line that BUILDS word by word as it's
  // spoken, every word redrawn ~12x/sec (the "boil"), each preceded by a quick scrawl.
  // ONE device — the emphasised word is underlined by hand, drawn twice (re-traced).
  {
    id: 'archives', name: 'Archives', badge: 'New', tags: ['Kinetic', 'Handwritten'],
    previewText: 'Everything',
    textStyle: { fontFamily: '"KaushanScript","Caveat","Segoe Script",cursive', color: '#E1CDC2', fontWeight: 400, fontSize: 22 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', justifyContent: 'center', fontFamily: '"KaushanScript","Caveat","Segoe Script","Brush Script MT",cursive', fontWeight: 400, padding: '10px 2px 14px' }}>
        <span style={{ color: '#E1CDC2', fontSize: 14, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>Your</span>
        <span style={{ position: 'relative', display: 'inline-block', color: '#E1CDC2', fontSize: 19, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
          <span style={{ position: 'relative', zIndex: 2 }}>Style</span>
          <svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', left: '-8%', bottom: '-30%', width: '116%', height: '28%', overflow: 'visible', zIndex: 3 }}>
            <path d="M2,7 Q26,3 50,8 T97,6" style={{ fill: 'none', stroke: '#E1CDC2', strokeWidth: 2.6, strokeLinecap: 'round' }} />
            <path d="M3,11 Q28,7 52,12 T96,10" style={{ fill: 'none', stroke: '#E1CDC2', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.6 }} />
          </svg>
        </span>
        <span style={{ color: '#E1CDC2', fontSize: 14, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>is it</span>
      </div>
    ),
  },
  // Two typographic voices in ONE sentence: a red condensed-caps run under a restrained glow,
  // the remainder continuing in a white roundhand script whose ascenders climb back INTO the
  // red band. Decoded frame-by-frame from a reference clip. No emphasis mechanic by design —
  // the voice change IS the emphasis.
  {
    id: 'blockbuster', name: 'Blockbuster', badge: 'New', tags: ['Kinetic', 'Cinematic'],
    previewText: 'This is the next big thing',
    textStyle: { fontFamily: '"Anton",Haettenschweiler,"Arial Narrow",Impact,sans-serif', color: '#FA232D', fontWeight: 700, fontSize: 22 },
    renderPreview: () => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 2px 16px' }}>
        <div style={{
          fontFamily: '"Anton",Haettenschweiler,"Arial Narrow",Impact,sans-serif', fontWeight: 700,
          textTransform: 'uppercase', fontSize: 17, lineHeight: 1, letterSpacing: '.035em', color: '#FA232D',
          transform: 'scaleX(.885)',
          textShadow: '0 0 5px rgba(250,35,45,.45),0 0 11px rgba(250,35,45,.42),0 0 20px rgba(250,35,45,.26)',
        }}>THIS IS THE NEXT</div>
        <div style={{
          fontFamily: '"GreatVibes","Snell Roundhand","Script MT Bold",cursive', fontWeight: 400,
          fontSize: 23, lineHeight: 1, letterSpacing: '.02em', color: '#fff', marginTop: -7, zIndex: 2,
          textShadow: '0 0 6px rgba(255,255,255,.6),0 0 15px rgba(255,255,255,.32),0 2px 3px rgba(0,0,0,.68),0 4px 13px rgba(0,0,0,.62)',
        }}>big thing</div>
      </div>
    ),
  },
  // Two states in one template. With no emphasised word it sets as a plain centred caption;
  // emphasise a word and that word becomes a large italic serif, with the rest of the line placed
  // into the empty strips its own letterforms leave — above the x-height, below the baseline.
  // One handwritten line that arrives word by word as it is spoken — each word blurring into
  // focus and growing the last 5% into place — then eases to a second colour and fades, so the
  // caption leaves as a gesture instead of a cut.
  {
    id: 'journal', name: 'Journal', badge: 'New', tags: ['Kinetic', 'Handwritten'],
    previewText: 'Routine',
    textStyle: { fontFamily: '"BradleyHand", "Bradley Hand ITC", cursive', color: '#FFFFFF', fontSize: 34 },
    previewBg: '#000000',
    renderPreview: () => (
      <div style={{
        fontFamily: '"BradleyHand", "Bradley Hand ITC", cursive', fontSize: 33, lineHeight: 1.2,
        color: '#fff', textShadow: '0 1.2px 5px rgba(0,0,0,.5)', whiteSpace: 'nowrap',
        display: 'flex', gap: 9, alignItems: 'baseline',
      }}>
        <span style={{ filter: 'blur(2.6px)', opacity: 0.55, transform: 'scale(.96)' }}>Back</span>
        <span>to</span>
        <span style={{ color: '#E8202A' }}>routine</span>
      </div>
    ),
  },
  {
    id: 'interlock', name: 'Interlock', badge: 'New', tags: ['Kinetic', 'Editorial'],
    previewText: "i can't draw a straight line",
    textStyle: { fontFamily: '"Playfair Display", Georgia, serif', color: '#F7F4EE', fontStyle: 'italic', fontSize: 24 },
    previewBg: '#000000',
    // The card is the template's own output, not an impression of it: these are the interlock
    // engine's coordinates for "i can't draw a *straight* line" at F=100, scaled by 0.55 and
    // offset by the layout's bbox — so I CAN'T DRAW A rides the ascender strip, the g and h of
    // "straight" rise between DRAW and A, and LINE hangs off the descender. Baselines, not box
    // bottoms. Regenerate with the engine if its constants change.
    renderPreview: () => {
      const ink = '#F7F4EE';
      const caps: React.CSSProperties = {
        position: 'absolute', fontFamily: '"MontserratSemiBold", Montserrat, sans-serif',
        fontWeight: 600, fontSize: 13.8, letterSpacing: '.045em', color: ink, whiteSpace: 'pre',
        lineHeight: 1, textShadow: '0 0.6px 3px rgba(0,0,0,.7)',
      };
      return (
        <div style={{ position: 'relative', width: 203, height: 65 }}>
          <div style={{
            position: 'absolute', left: 16.5, top: 0.4,
            fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', fontWeight: 500,
            fontSize: 55, lineHeight: 1, color: ink, whiteSpace: 'pre',
            textShadow: '0 2.3px 11px rgba(0,0,0,.7)',
          }}>straight</div>
          <span style={{ ...caps, left: 0,      top: -2.2 }}>I</span>
          <span style={{ ...caps, left: 11.9,   top: -2.2 }}>CAN&apos;T</span>
          <span style={{ ...caps, left: 64.6,   top: -2.2 }}>DRAW</span>
          <span style={{ ...caps, left: 131.7,  top: -2.2 }}>A</span>
          <span style={{ ...caps, left: 166.6,  top: 53.6 }}>LINE</span>
        </div>
      );
    },
  },
];

// ── Template categories (web picker subsections) ──────────────────────────────
// The picker groups built-in templates into three labelled sections:
//   • Dynamic — animated, per-word kinetic looks (the hero/editorial families).
//   • AI      — templates that need an AI step (Big Reveal's subject cut-out).
//   • Static  — everything else (clean, burn-in-style captions).
export type StyleCategory = 'dynamic' | 'static' | 'ai';

const DYNAMIC_STYLE_IDS: ReadonlySet<string> = new Set<CaptionStyleId>([
  'captik', 'captik_shadow', 'captik_glow', 'delhi', 'editor_masala', 'illusion', 'aura', 'aura_helvetica',
  'big_red', 'scribble', 'archives', 'blockbuster', 'interlock', 'journal',
]);
const AI_STYLE_IDS: ReadonlySet<string> = new Set<CaptionStyleId>(['big_reveal']);

// ── Templates with a separately-sized TITLE ───────────────────────────────────
// Templates that draw their emphasised words as a big TITLE sized independently of the caption
// (emphFontScale), so the Text tab offers "Title size" + "Caption size" instead of one "Size".
// big_reveal also positions its title on a SECOND box (iamdumb.md §1.9); big_red stacks both
// layers in the ONE box, so it takes the size pair but not the second box.
const TITLE_SIZE_STYLE_IDS: ReadonlySet<string> = new Set<CaptionStyleId>(['big_reveal', 'big_red']);
export function hasTitleSize(id: string | undefined): boolean {
  return !!id && TITLE_SIZE_STYLE_IDS.has(id);
}

export function styleCategory(id: CaptionStyleId): StyleCategory {
  if (AI_STYLE_IDS.has(id)) return 'ai';
  if (DYNAMIC_STYLE_IDS.has(id)) return 'dynamic';
  return 'static';
}

// Render order of the sections in the picker.
export const STYLE_CATEGORIES: { key: StyleCategory; label: string }[] = [
  { key: 'dynamic', label: 'Dynamic Captions' },
  { key: 'static',  label: 'Static Captions' },
  { key: 'ai',      label: 'AI Captions' },
];
