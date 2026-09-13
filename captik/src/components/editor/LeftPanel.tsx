'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, Sparkles, Clapperboard, Loader2, ChevronRight, Wand2, Copy, Check, RefreshCw, SlidersHorizontal, ChevronDown, Scissors, Plus, Pencil, Trash2, ChevronUp, Undo2, Redo2, Blend, LayoutPanelTop } from 'lucide-react';
import type { TranscriptWord, LineOverride, CaptionBoxConfig } from '@/types/transcript';
import type { HookResponse } from '@/app/api/hook/route';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import Tooltip from '@/components/ui/Tooltip';
import { CAPTION_STYLES as TEMPLATE_DEFS } from '@/lib/captionStyles';
import LineStylingPopover from './LineStylingPopover';

type Tab = 'captions' | 'hook' | 'broll';

const TABS: { id: Tab; icon: React.FC<React.SVGProps<SVGSVGElement>>; label: string }[] = [
  { id: 'captions',  icon: Type,          label: 'Captions'  },
  { id: 'hook',      icon: Sparkles,      label: 'AI Hook'   },
  { id: 'broll',     icon: Clapperboard,  label: 'B-Roll'    },
];

// One-line tooltips for the icon rail.
const TAB_HINTS: Record<Tab, string> = {
  captions: 'Edit caption lines, words & colours',
  hook:     'Generate hook ideas with AI',
  broll:    'B-Roll suggestions — coming soon',
};

interface StyleDef {
  id:             CaptionStyleId;
  name:           string;
  badge?:         string;
  tags:           string[];
  previewText:    string;
  textStyle:      React.CSSProperties;
  previewBg?:     string;
  renderPreview?: () => React.ReactNode;
}

const CAPTION_STYLES: StyleDef[] = [
  // ── Captik T4 order — 29 styles ──────────────────────────────────────────
  {
    id: 'captik_glow', name: 'Captik Glow', badge: 'Popular', tags: ['Bold', 'Glow'],
    previewText: 'WELCOME',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#a0d83e', fontWeight: 800, fontSize: 24 },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 400, marginBottom: 2 }}>Hello and</div>
        <div style={{ backgroundImage: 'linear-gradient(to bottom,#a0d83e,#a0d83e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>WELCOME</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 400, marginTop: 2 }}>to Captik.</div>
      </div>
    ),
  },
  {
    id: 'ali_abdaal', name: 'Ali Abdaal', tags: [],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: 'Poppins, sans-serif', color: '#000000', fontWeight: 700, fontSize: 16 },
    previewBg: 'rgba(30,30,40,0.95)',
    renderPreview: () => (
      <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'baseline', fontFamily: 'Poppins, sans-serif' }}>
        <span style={{ color: '#000000', fontWeight: 700, fontSize: 14, background: '#FFFFFF', padding: '1px 6px', borderRadius: 4 }}>The quick</span>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500, fontSize: 14 }}>brown fox</span>
      </div>
    ),
  },
  {
    id: 'captik_shadow', name: 'Captik Shadow', badge: 'New', tags: ['Bold'],
    previewText: 'WELCOME',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 800, fontSize: 24 },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ backgroundImage: 'linear-gradient(to bottom,rgba(255,255,255,0.45),rgba(148,148,148,0.45))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: 11, marginBottom: 2 }}>Hello and</div>
        <div style={{ backgroundImage: 'linear-gradient(to bottom,#ffffff 0%,#ffffff 50%,#949494 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, fontSize: 22 }}>WELCOME</div>
        <div style={{ backgroundImage: 'linear-gradient(to bottom,rgba(255,255,255,0.45),rgba(148,148,148,0.45))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: 11, marginTop: 2 }}>to Captik</div>
      </div>
    ),
  },
  {
    id: 'captik', name: 'Captik', tags: [],
    previewText: 'WELCOME',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#C8FF00', fontWeight: 800, fontSize: 22 },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 500, marginBottom: 2 }}>Hello and</div>
        <div style={{ color: '#C8FF00', fontWeight: 800, fontSize: 22, lineHeight: 0.9 }}>WELCOME</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 500, marginTop: 2 }}>to Captik.</div>
      </div>
    ),
  },
  {
    id: 'clean_motion', name: 'Clean Motion', tags: [],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 500, fontSize: 20 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 14 }}>yeh kya</span>
        <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 17 }}>ho raha</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 14 }}>hai</span>
      </div>
    ),
  },
  {
    id: 'bubble', name: 'Bubble Style', tags: [],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: '"Times New Roman", serif', color: '#ffffff', fontWeight: 600, fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', fontFamily: '"Times New Roman", serif' }}>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 15 }}>The quick</span>
        <span style={{ background: '#48A680', color: '#000', fontWeight: 600, fontSize: 15, padding: '2px 8px', borderRadius: 8 }}>brown</span>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 15 }}>fox</span>
      </div>
    ),
  },
  {
    id: 'hormozi', name: 'Hormozi Style', badge: 'Popular', tags: ['Bold'],
    previewText: 'HO RAHA',
    textStyle: { fontFamily: 'Anton, sans-serif', color: '#a5fd4b', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' },
    renderPreview: () => {
      const grad: React.CSSProperties = {
        backgroundImage: 'linear-gradient(to bottom,#77a748 0%,#97DE25 38%,#9FF747 60%,#a5fd4b 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        fontFamily: 'Anton, sans-serif', fontWeight: 700, textTransform: 'uppercase' as const,
      };
      return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...grad, fontSize: 13 }}>YEH KYA</span>
          <span style={{ ...grad, fontSize: 22 }}>HO RAHA</span>
          <span style={{ ...grad, fontSize: 13 }}>HAI</span>
        </div>
      );
    },
  },
  {
    id: 'boxed', name: 'Editing Skool', tags: ['Bold'],
    previewText: 'RAHA',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 700, fontSize: 20, textTransform: 'uppercase' },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginBottom: 4 }}>yeh kya ho</div>
        <div style={{ background: '#f48601', borderRadius: 4, padding: '5px 16px', display: 'inline-block' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 19, textTransform: 'uppercase' }}>RAHA</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 4 }}>hai</div>
      </div>
    ),
  },
  {
    id: 'mrbeast', name: 'Mr Beast Style 1', tags: ['Bold', 'Shadow'],
    previewText: 'HO RAHA',
    textStyle: { fontFamily: '"Luckiest Guy", cursive', color: '#ffffff', fontWeight: 900, fontSize: 22, textTransform: 'uppercase' },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: '"Luckiest Guy", cursive', color: '#ffffff', fontWeight: 900, fontSize: 14, textTransform: 'uppercase', textShadow: '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000' }}>YEH KYA</span>
        <span style={{ fontFamily: '"Luckiest Guy", cursive', color: '#fff', fontWeight: 900, fontSize: 21, textTransform: 'uppercase', textShadow: '-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 -3px 0 #000,0 3px 0 #000,-3px 0 0 #000,3px 0 0 #000' }}>HO RAHA</span>
        <span style={{ fontFamily: '"Luckiest Guy", cursive', color: '#ffffff', fontWeight: 900, fontSize: 14, textTransform: 'uppercase', textShadow: '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000' }}>HAI</span>
      </div>
    ),
  },
  {
    id: 'mr_beast_2', name: 'Mr Beast Style 2', tags: ['Bold', 'Shadow'],
    previewText: 'HO RAHA',
    textStyle: { color: '#FFD700', fontWeight: 900, fontSize: 18, textShadow: '0 4px 8px rgba(0,0,0,0.9)' },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: 14 }}>yeh kya</span>
        <span style={{ color: '#FFD700', fontWeight: 900, fontSize: 18, textShadow: '0 4px 8px rgba(0,0,0,0.9)' }}>HO RAHA</span>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: 14 }}>hai</span>
      </div>
    ),
  },
  {
    id: 'iman_gadzhi', name: 'Iman Gadzhi', tags: [],
    previewText: 'The quick brown fox',
    textStyle: { color: '#ffffff', fontWeight: 600, fontSize: 20 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 14 }}>yeh kya</span>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 18 }}>HO RAHA</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: 14 }}>hai</span>
      </div>
    ),
  },
  {
    id: 'prism', name: 'Devin Jatho', tags: ['Shadow'],
    previewText: 'HO RAHA',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#A34EFF', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', textShadow: '0 0 20px #A34EFF80,0 0 40px #A34EFF40' },
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Montserrat, sans-serif' }}>
        <div style={{ color: 'rgba(163,78,255,0.3)', fontSize: 10, marginBottom: 4 }}>yeh kya</div>
        <div style={{ color: '#A34EFF', fontWeight: 700, fontSize: 21, textTransform: 'uppercase', textShadow: '0 0 16px #A34EFF70' }}>HO RAHA</div>
        <div style={{ color: 'rgba(163,78,255,0.3)', fontSize: 10, marginTop: 4 }}>hai</div>
      </div>
    ),
  },
  {
    id: 'highlighted_word', name: 'Highlighted Word', tags: ['Bold'],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#fff', fontWeight: 600, fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'center', fontFamily: 'Montserrat, sans-serif' }}>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 15 }}>The quick</span>
        <span style={{ color: '#F5A623', fontWeight: 700, fontSize: 15 }}>brown</span>
        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 15 }}>fox</span>
      </div>
    ),
  },
  {
    id: 'clean_glow', name: 'Clean Glow Style', tags: ['Shadow'],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 19, textShadow: '0px 0px 14px rgba(255,255,255,0.9)' },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, fontSize: 13 }}>yeh kya</span>
        <span style={{ color: '#ffffff', fontWeight: 400, fontSize: 17, textShadow: '0px 0px 14px rgba(255,255,255,0.9)' }}>HO RAHA</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, fontSize: 13 }}>hai</span>
      </div>
    ),
  },
  {
    id: 'captik_clean', name: 'Captik Clean', tags: [],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 19, textShadow: '1px 1px 2px rgba(0,0,0,0.3)' },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400, fontSize: 13 }}>yeh kya</span>
        <span style={{ color: '#ffffff', fontWeight: 400, fontSize: 17, textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>HO RAHA</span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400, fontSize: 13 }}>hai</span>
      </div>
    ),
  },
  {
    id: 'black_punch', name: 'Black Punch', tags: ['Bold'],
    previewText: 'AAJA',
    textStyle: { fontFamily: 'Anton, sans-serif', color: '#000000', fontWeight: 700, fontSize: 22, textTransform: 'uppercase' },
    previewBg: 'rgba(190,190,190,0.9)',
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Anton, sans-serif' }}>
        <div style={{ color: 'rgba(0,0,0,0.35)', fontSize: 10, marginBottom: 4 }}>yeh kya</div>
        <div style={{ color: '#000000', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', WebkitTextStroke: '0.3px rgba(100,100,100,0.7)' }}>AAJA</div>
        <div style={{ color: 'rgba(0,0,0,0.35)', fontSize: 10, marginTop: 4 }}>bhai</div>
      </div>
    ),
  },
  {
    id: 'captik_word', name: 'Captik Word', tags: [],
    previewText: '',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#fff', fontWeight: 700, fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 16 }}>The quick</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 16, filter: 'blur(3px)' }}>brown</span>
      </div>
    ),
  },
  {
    id: 'pixelated', name: 'Pixelated Word', tags: [],
    previewText: 'HO_RAHA',
    textStyle: { color: '#ffffff', fontWeight: 400, fontSize: 18, fontFamily: 'monospace' },
    renderPreview: () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginBottom: 4, letterSpacing: '0.1em', fontFamily: 'monospace' }}>YEH_KYA</div>
        <div style={{ color: '#ffffff', fontWeight: 400, fontSize: 17, fontFamily: 'monospace', letterSpacing: '0.05em' }}>HO_RAHA</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 4, fontFamily: 'monospace', letterSpacing: '0.1em' }}>HAI_</div>
      </div>
    ),
  },
  {
    id: 'liquid_glass', name: 'Liquid Glass', tags: [],
    previewText: 'The quick brown fox',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 300 },
    renderPreview: () => (
      <div style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 72, padding: '7px 16px', display: 'inline-flex', gap: 5, backdropFilter: 'blur(10px)', fontFamily: 'Montserrat, sans-serif' }}>
        <span style={{ color: '#918b7c', fontWeight: 300, fontSize: 13 }}>The quick</span>
        <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 300, fontSize: 13 }}>brown fox</span>
      </div>
    ),
  },
  {
    id: 'tabahi', name: 'Tabahi', tags: ['Bold', 'Shadow'],
    previewText: 'HO RAHA',
    textStyle: { color: '#ffffff', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', WebkitTextStroke: '0.066em black' as string },
    renderPreview: () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginBottom: 4 }}>yeh kya</div>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', WebkitTextStroke: '0.066em black' as string, textShadow: '-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 -3px 0 #000,0 3px 0 #000,-3px 0 0 #000,3px 0 0 #000' }}>HO RAHA</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 4 }}>hai</div>
      </div>
    ),
  },
  {
    id: 'deep_glow', name: 'Deep Glow', tags: ['Bold', 'Shadow'],
    previewText: 'HO RAHA',
    textStyle: { color: 'rgba(255,255,255,0.8)', fontWeight: 900, fontSize: 18, textTransform: 'uppercase', textShadow: '0 0 10px #FF00FF,0 0 20px #FF00FF,0 0 30px #FF00FF' },
    renderPreview: () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'rgba(255,0,255,0.25)', fontSize: 10, marginBottom: 4, letterSpacing: '0.05em' }}>YEH KYA</div>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 900, fontSize: 18, textTransform: 'uppercase', textShadow: '0 0 10px #FF00FF,0 0 20px #FF00FF,0 0 30px #FF00FF,0 0 40px #FF00FF', letterSpacing: '0.03em' }}>HO RAHA</div>
        <div style={{ color: 'rgba(255,0,255,0.25)', fontSize: 10, marginTop: 4, letterSpacing: '0.05em' }}>HAI</div>
      </div>
    ),
  },
  {
    id: 'seedha_saadha', name: 'Seedha Saadha', tags: ['Shadow'],
    previewText: 'HO RAHA',
    textStyle: { color: '#ffffff', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', WebkitTextStroke: '0.085em black' as string },
    previewBg: '#000000',
    renderPreview: () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginBottom: 4 }}>YEH KYA</div>
        <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', WebkitTextStroke: '0.085em black' as string }}>HO RAHA</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 4 }}>HAI</div>
      </div>
    ),
  },
  {
    id: 'thora_cinematic', name: 'Thora Cinematic', tags: [],
    previewText: 'HO RAHA HAI',
    textStyle: { fontFamily: 'Montserrat, sans-serif', color: '#ffffff', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.3em' },
    previewBg: 'rgba(30,41,59,0.88)',
    renderPreview: () => (
      <div style={{ textAlign: 'center', fontFamily: 'Montserrat, sans-serif' }}>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, marginBottom: 5, letterSpacing: '0.3em', textTransform: 'uppercase' }}>YEH KYA</div>
        <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.3em' }}>HO RAHA HAI</div>
      </div>
    ),
  },
  {
    id: 'delhi', name: 'Delhi', tags: [],
    previewText: '',
    textStyle: { fontFamily: '"Instrument Sans", sans-serif', color: '#fff', fontSize: 17 },
    renderPreview: () => (
      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
        <span style={{ fontFamily: '"Instrument Sans", sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 15 }}>The quick</span>
        <span style={{ fontFamily: '"Instrument Serif", serif', color: '#ffffff', fontWeight: 400, fontSize: 15, fontStyle: 'italic', textShadow: '0 0 14px rgba(255,255,255,0.8)' }}>brown</span>
        <span style={{ fontFamily: '"Instrument Sans", sans-serif', color: '#ffffff', fontWeight: 400, fontSize: 15 }}>fox</span>
      </div>
    ),
  },
];

const COLOR_PRESETS = ['#facc15', '#f87171', '#4ade80', '#a78bfa', '#fb923c', '#38bdf8', '#f472b6', '#ffffff', '#e4e4e7', '#6b7280'];

export interface CaptionSettings {
  maxWords:   number;
  minDurSec:  number;
  gapFrames:  number;
  lines:      'single' | 'double';
}

interface LeftPanelProps {
  words:                   TranscriptWord[];
  selectedWordId:          string | null;
  currentTimeMs:           number;
  onWordSelect:            (id: string) => void;
  onWordUpdate:            (id: string, text: string) => void;
  onWordColor:             (id: string, color: string) => void;
  onWordEmphasis:          (id: string) => void;
  onWordHighlight:         (id: string) => void;
  captionSegments:         string[][];
  onSplitAfter:            (segIdx: number, afterWordId: string) => void;
  onSplitBefore:           (segIdx: number, beforeWordId: string) => void;
  onMergeWithPrev:         (segIdx: number) => void;
  onMergeWithNext:         (segIdx: number) => void;
  onDeleteSegment:         (segIdx: number) => void;
  onRegenerateSegments:    (settings: CaptionSettings) => void;
  onEditCaption:           (segIdx: number, newText: string) => void;
  onSplitAtCursor:         (segIdx: number, cursorPos: number, fullText: string) => void;
  onAddLine:               () => void;
  onSeekTo?:               (ms: number) => void;
  onNextLine:              (segIdx: number, wordId: string) => void;
  onPrevLine:              (segIdx: number, wordId: string) => void;
  hookData:                HookResponse | null;
  hookError:               string;
  isLoadingHook:           boolean;
  onGenerateHook:          () => void;
  transcript:              string;
  accentColor:             string;
  captionLines:            'single' | 'double';
  onCaptionLinesChange:    (v: 'single' | 'double') => void;
  captionStyle:            CaptionStyleId;
  onUndo:                  () => void;
  canUndo:                 boolean;
  onRedo:                  () => void;
  canRedo:                 boolean;
  mobile?:                 boolean;
  /** Per-line style override bundles (keyed by segment first-word id) + patcher.
      `keys` may be several segment keys at once (multi-select bulk apply). */
  lineOverrides?:          Record<string, LineOverride>;
  onLineOverride?:         (keys: string | string[], patch: Partial<LineOverride> | null) => void;
  captionBox?:             CaptionBoxConfig;
}

export default function LeftPanel({
  words, selectedWordId, currentTimeMs, onWordSelect, onWordUpdate, onWordColor, onWordEmphasis, onWordHighlight,
  captionSegments, onSplitAfter, onSplitBefore, onMergeWithPrev, onMergeWithNext, onDeleteSegment,
  onRegenerateSegments, onEditCaption, onSplitAtCursor, onAddLine, onSeekTo,
  onNextLine, onPrevLine,
  hookData, hookError, isLoadingHook, onGenerateHook,
  transcript,
  accentColor,
  captionLines, onCaptionLinesChange,
  captionStyle,
  onUndo, canUndo, onRedo, canRedo,
  mobile = false,
  lineOverrides = {}, onLineOverride,
  captionBox = { xPercent: 50, yPercent: 85, widthPercent: 84 },
}: LeftPanelProps) {
  const [tab, setTab] = useState<Tab>('captions');

  return (
    <aside data-tour="captions-panel" className={`flex h-full ${mobile ? 'w-full' : 'shrink-0'}`} style={mobile ? undefined : { width: 260 }}>
      {/* Icon rail */}
      <div className="flex flex-col items-center gap-1 py-3 px-2 bg-zinc-950 border-r border-white/[0.04]" style={{ width: 52 }}>
        {TABS.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id} label={TAB_HINTS[id] ?? label} side="bottom">
            <button
              onClick={() => setTab(id)}
              aria-label={label}
              aria-pressed={tab === id}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer ${
                tab === id
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-400/20'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900/50 border-r border-white/[0.06]">
        <div className="px-3 py-2.5 border-b border-white/[0.05] shrink-0">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            {TABS.find((t) => t.id === tab)?.label}
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.14 }}
            className="flex-1 overflow-y-auto"
          >
            {tab === 'captions' && (
              <CaptionsTab
                words={words}
                selectedWordId={selectedWordId}
                currentTimeMs={currentTimeMs}
                onWordSelect={onWordSelect}
                onWordUpdate={onWordUpdate}
                onWordColor={onWordColor}
                onWordEmphasis={onWordEmphasis}
                onWordHighlight={onWordHighlight}
                accentColor={accentColor}
                captionSegments={captionSegments}
                onSplitAfter={onSplitAfter}
                onSplitBefore={onSplitBefore}
                onMergeWithPrev={onMergeWithPrev}
                onMergeWithNext={onMergeWithNext}
                onDeleteSegment={onDeleteSegment}
                onRegenerateSegments={onRegenerateSegments}
                onEditCaption={onEditCaption}
                onSplitAtCursor={onSplitAtCursor}
                onAddLine={onAddLine}
                onSeekTo={onSeekTo}
                onNextLine={onNextLine}
                onPrevLine={onPrevLine}
                captionLines={captionLines}
                onCaptionLinesChange={onCaptionLinesChange}
                captionStyle={captionStyle}
                onUndo={onUndo}
                canUndo={canUndo}
                onRedo={onRedo}
                canRedo={canRedo}
                lineOverrides={lineOverrides}
                onLineOverride={onLineOverride}
                captionBox={captionBox}
              />
            )}
            {tab === 'hook' && (
              <HookTab
                transcript={transcript}
                hookData={hookData}
                hookError={hookError}
                isLoading={isLoadingHook}
                onGenerate={onGenerateHook}
              />
            )}
            {tab === 'broll' && <BRollTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

// ── Captions tab ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: CaptionSettings = { maxWords: 4, minDurSec: 0, gapFrames: 0, lines: 'single' };

function CaptionsTab({
  words, selectedWordId, currentTimeMs,
  onWordSelect, onWordUpdate, onWordColor, onWordEmphasis, onWordHighlight, accentColor,
  captionSegments, onSplitAfter, onSplitBefore, onMergeWithPrev, onMergeWithNext, onDeleteSegment,
  onRegenerateSegments, onEditCaption, onSplitAtCursor, onAddLine, onSeekTo,
  onNextLine, onPrevLine,
  captionLines, onCaptionLinesChange, captionStyle,
  onUndo, canUndo, onRedo, canRedo,
  lineOverrides = {}, onLineOverride, captionBox,
}: {
  words:                TranscriptWord[];
  selectedWordId:       string | null;
  currentTimeMs:        number;
  onWordSelect:         (id: string) => void;
  onWordUpdate:         (id: string, text: string) => void;
  onWordColor:          (id: string, color: string) => void;
  onWordEmphasis:       (id: string) => void;
  onWordHighlight:      (id: string) => void;
  accentColor:          string;
  captionSegments:      string[][];
  onSplitAfter:         (segIdx: number, afterWordId: string) => void;
  onSplitBefore:        (segIdx: number, beforeWordId: string) => void;
  onMergeWithPrev:      (segIdx: number) => void;
  onMergeWithNext:      (segIdx: number) => void;
  onDeleteSegment:      (segIdx: number) => void;
  onRegenerateSegments: (s: CaptionSettings) => void;
  onEditCaption:        (segIdx: number, newText: string) => void;
  onSplitAtCursor:      (segIdx: number, cursorPos: number, fullText: string) => void;
  onAddLine:            () => void;
  onSeekTo?:            (ms: number) => void;
  onNextLine:           (segIdx: number, wordId: string) => void;
  onPrevLine:           (segIdx: number, wordId: string) => void;
  captionLines:         'single' | 'double';
  onCaptionLinesChange: (v: 'single' | 'double') => void;
  captionStyle:         CaptionStyleId;
  onUndo:               () => void;
  canUndo:              boolean;
  onRedo:               () => void;
  canRedo:              boolean;
  lineOverrides?:       Record<string, LineOverride>;
  onLineOverride?:      (keys: string | string[], patch: Partial<LineOverride> | null) => void;
  captionBox?:          CaptionBoxConfig;
}) {
  const selectedWord = words.find((w) => w.id === selectedWordId) ?? null;
  const isKalakarStyle = captionStyle === 'captik' || captionStyle === 'captik_glow' || captionStyle === 'captik_shadow';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings]         = useState<CaptionSettings>(DEFAULT_SETTINGS);

  const set = <K extends keyof CaptionSettings>(key: K, val: CaptionSettings[K]) =>
    setSettings(s => ({ ...s, [key]: val }));

  return (
    <div className="flex flex-col gap-0">

          {/* Word colour picker for selected word */}
          <AnimatePresence>
            {selectedWord && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3 py-2 border-b border-white/[0.04] overflow-hidden bg-[#0f0f16]"
              >
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
                  Colour · <span className="text-white normal-case font-semibold">{selectedWord.text}</span>
                </p>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => onWordColor(selectedWord.id, c)}
                      title={c}
                      className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                        selectedWord.styleOverride?.color === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    onClick={() => onWordColor(selectedWord.id, '')}
                    title="Clear colour"
                    className="w-5 h-5 rounded-full border border-white/10 text-[9px] text-zinc-500 hover:text-white cursor-pointer transition-colors flex items-center justify-center"
                  >✕</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lines toggle — hidden for kalakar styles (they control lines via emphasis) */}
          {!isKalakarStyle && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Lines</span>
              <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
                {(['single', 'double'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => { set('lines', v); onCaptionLinesChange(v); }}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                      captionLines === v
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {v === 'single' ? '1 Line' : '2 Lines'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Caption generator settings */}
          <div className="border-b border-white/[0.04]">
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3 text-zinc-600 shrink-0" />
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest flex-1 text-left">Caption settings</span>
              <ChevronDown className={`w-3 h-3 text-zinc-700 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] text-zinc-500">Max words per caption</label>
                        <span className="text-[10px] text-zinc-400 font-mono font-semibold">{settings.maxWords} words</span>
                      </div>
                      <input type="range" min={2} max={8} step={1} value={settings.maxWords}
                        onChange={e => set('maxWords', Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-400"
                        style={{ background: `linear-gradient(to right, #f59e0b ${(settings.maxWords - 2) / 6 * 100}%, #27272a ${(settings.maxWords - 2) / 6 * 100}%)` }}
                      />
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] text-zinc-700">2</span>
                        <span className="text-[9px] text-zinc-700">8</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] text-zinc-500">Min duration (seconds)</label>
                        <span className="text-[10px] text-zinc-400 font-mono font-semibold">{settings.minDurSec.toFixed(1)}</span>
                      </div>
                      <input type="range" min={0} max={5} step={0.5} value={settings.minDurSec}
                        onChange={e => set('minDurSec', Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-400"
                        style={{ background: `linear-gradient(to right, #f59e0b ${settings.minDurSec / 5 * 100}%, #27272a ${settings.minDurSec / 5 * 100}%)` }}
                      />
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] text-zinc-700">0s</span>
                        <span className="text-[9px] text-zinc-700">5s</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] text-zinc-500">Gap between captions (frames)</label>
                        <span className="text-[10px] text-zinc-400 font-mono font-semibold">{settings.gapFrames}</span>
                      </div>
                      <input type="range" min={0} max={12} step={1} value={settings.gapFrames}
                        onChange={e => set('gapFrames', Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-400"
                        style={{ background: `linear-gradient(to right, #f59e0b ${settings.gapFrames / 12 * 100}%, #27272a ${settings.gapFrames / 12 * 100}%)` }}
                      />
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] text-zinc-700">0</span>
                        <span className="text-[9px] text-zinc-700">12</span>
                      </div>
                    </div>
                    {!isKalakarStyle && (
                      <div>
                        <p className="text-[10px] text-zinc-500 mb-2">Lines per caption</p>
                        <div className="flex gap-3">
                          {(['single', 'double'] as const).map(v => (
                            <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name="lines" value={v} checked={captionLines === v}
                                onChange={() => { set('lines', v); onCaptionLinesChange(v); }}
                                className="accent-amber-400 w-3 h-3 cursor-pointer"
                              />
                              <span className="text-[11px] text-zinc-300 capitalize">{v}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => { onRegenerateSegments(settings); setSettingsOpen(false); }}
                      disabled={words.length === 0}
                      className="w-full py-2 rounded-lg bg-amber-500 text-xs font-bold text-white hover:bg-amber-400 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-400/15"
                    >
                      Create captions
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Captions count header + undo */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Captions</p>
            <div className="flex items-center gap-2">
              {captionSegments.length > 0 && (
                <span className="text-[10px] text-zinc-700">{captionSegments.length} lines</span>
              )}
              <Tooltip label="Undo the last change" shortcut="Ctrl+Z">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  canUndo
                    ? 'text-zinc-400 hover:text-white hover:bg-white/[0.07] cursor-pointer'
                    : 'text-zinc-700 cursor-not-allowed'
                }`}
              >
                <Undo2 className="w-3 h-3" /> Undo
              </button>
              </Tooltip>
              <Tooltip label="Redo" shortcut="Ctrl+Shift+Z">
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  canRedo
                    ? 'text-zinc-400 hover:text-white hover:bg-white/[0.07] cursor-pointer'
                    : 'text-zinc-700 cursor-not-allowed'
                }`}
              >
                <Redo2 className="w-3 h-3" /> Redo
              </button>
              </Tooltip>
            </div>
          </div>

          {/* Kalakar-style caption list */}
          <KalakarCaptionList
            lineOverrides={lineOverrides}
            onLineOverride={onLineOverride}
            captionBox={captionBox}
            words={words}
            segments={captionSegments}
            currentTimeMs={currentTimeMs}
            onMergeWithPrev={onMergeWithPrev}
            onMergeWithNext={onMergeWithNext}
            onDeleteSegment={onDeleteSegment}
            onEditCaption={onEditCaption}
            onSplitAtCursor={onSplitAtCursor}
            onAddLine={onAddLine}
            onSeekTo={onSeekTo}
            onWordEmphasis={onWordEmphasis}
            onWordHighlight={onWordHighlight}
            captionStyle={captionStyle}
            onWordColor={onWordColor}
            onWordUpdate={onWordUpdate}
            onNextLine={onNextLine}
            onPrevLine={onPrevLine}
            accentColor={accentColor}
          />
    </div>
  );
}

// ── Caption card list ─────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s  = Math.floor(ms / 1000);
  const ds = Math.floor((ms % 1000) / 100);
  const m  = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}.${ds}`;
}

function KalakarCaptionList({
  words, segments, currentTimeMs,
  onMergeWithPrev, onMergeWithNext, onDeleteSegment,
  onEditCaption, onSplitAtCursor, onAddLine, onSeekTo,
  onWordEmphasis, onWordHighlight, captionStyle, onWordColor, onWordUpdate, onNextLine, onPrevLine, accentColor,
  lineOverrides = {}, onLineOverride, captionBox,
}: {
  words:            TranscriptWord[];
  segments:         string[][];
  currentTimeMs:    number;
  onMergeWithPrev:  (segIdx: number) => void;
  onMergeWithNext:  (segIdx: number) => void;
  onDeleteSegment:  (segIdx: number) => void;
  onWordUpdate:     (id: string, text: string) => void;
  onEditCaption:    (segIdx: number, newText: string) => void;
  onSplitAtCursor:  (segIdx: number, cursorPos: number, fullText: string) => void;
  onAddLine:        () => void;
  onSeekTo?:        (ms: number) => void;
  onWordEmphasis:   (id: string) => void;
  onWordHighlight:  (id: string) => void;
  captionStyle:     CaptionStyleId;
  onWordColor:      (id: string, color: string) => void;
  onNextLine:       (segIdx: number, wordId: string) => void;
  onPrevLine:       (segIdx: number, wordId: string) => void;
  accentColor:      string;
  lineOverrides?:   Record<string, LineOverride>;
  onLineOverride?:  (keys: string | string[], patch: Partial<LineOverride> | null) => void;
  captionBox?:      CaptionBoxConfig;
}) {
  const [editingIdx,     setEditingIdx]  = useState<number | null>(null);
  const [editValue,      setEditValue]   = useState('');
  const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; wordId: string; segIdx: number } | null>(null);
  const [editingWordId,  setEditingWordId]  = useState<string | null>(null);
  const [editingWordVal, setEditingWordVal] = useState('');
  const wordInputRef = useRef<HTMLInputElement>(null);

  const inputRef  = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  // ── Line styling: popover + drag-to-copy + drag multi-select ───────────────
  const [stylePopover, setStylePopover] = useState<{ x: number; y: number; segIdx: number; keys: string[] } | null>(null);
  // Multi-select (segment indexes). Built by mouse-dragging across rows or
  // Ctrl/Shift-clicking; bulk style applies to every selected line.
  const [multiSel, setMultiSel] = useState<Set<number>>(new Set());
  const dragSelRef = useRef<{ startIdx: number; active: boolean } | null>(null);
  // Drag-to-copy state: which segment's style chip is being dragged, and the row under it.
  const [chipDragFrom, setChipDragFrom] = useState<string | null>(null);
  const [chipDragOver, setChipDragOver] = useState<number | null>(null);

  useEffect(() => {
    const up = () => {
      if (dragSelRef.current) dragSelRef.current = null;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  // Short uppercase tag for a per-line template chip (e.g. ali_abdaal → "ALI").
  const chipLabel = (styleId: string): string => {
    const tpl = TEMPLATE_DEFS.find(s => s.id === styleId);
    const name = tpl?.name ?? styleId;
    return name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/)[0].slice(0, 4).toUpperCase();
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  // Build wordMap defensively — handles any word array passed in
  const wordMap = useMemo(() => new Map(words.map(w => [w.id, w])), [words]);

  const activeSegIdx = useMemo(() => {
    return segments.findIndex(seg =>
      seg.some(id => {
        const w = wordMap.get(id);
        return w && currentTimeMs >= w.startMs && currentTimeMs <= w.endMs + 200;
      }),
    );
  }, [segments, wordMap, currentTimeMs]);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeSegIdx]);

  const startEdit = (segIdx: number, text: string) => {
    setEditingIdx(segIdx);
    setEditValue(text);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  };

  const commitEdit = (segIdx: number) => {
    if (editValue.trim()) onEditCaption(segIdx, editValue.trim());
    setEditingIdx(null);
  };

  const handleSplit = (segIdx: number) => {
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? Math.floor(editValue.length / 2);
    onSplitAtCursor(segIdx, cursor, editValue);
    setEditingIdx(null);
  };

  const handleCardClick = (segIdx: number, first: ReturnType<typeof wordMap.get>) => {
    if (editingIdx !== null) return;
    if (selectedSegIdx !== segIdx) {
      setSelectedSegIdx(segIdx);
      if (first) onSeekTo?.(first.startMs);
    } else {
      setSelectedSegIdx(null);
    }
  };

  if (words.length === 0) {
    return <p className="text-xs text-zinc-700 px-4 py-4">Upload a video to see captions.</p>;
  }

  if (segments.length === 0) {
    return <p className="text-xs text-zinc-700 px-4 py-4 animate-pulse">Building captions…</p>;
  }

  return (
    <>
      <div className="px-2 pt-1.5 pb-3 flex flex-col gap-1.5">
        {segments.map((seg, segIdx) => {
          const isActive   = segIdx === activeSegIdx;
          const isEditing  = editingIdx === segIdx;
          const isSelected = selectedSegIdx === segIdx;
          const inMultiSel = multiSel.has(segIdx);
          const segKey     = seg[0];
          const lineOv     = segKey ? lineOverrides[segKey] : undefined;
          const isDropTarget = chipDragOver === segIdx && chipDragFrom !== null && chipDragFrom !== segKey;
          const first = wordMap.get(seg[0]);
          const last  = wordMap.get(seg[seg.length - 1]);
          const text  = seg.map(id => wordMap.get(id)?.text ?? '').filter(Boolean).join(' ');

          // Resolve all words for this segment — skip IDs not in wordMap
          const segWords = seg.map(id => wordMap.get(id)).filter((w): w is TranscriptWord => !!w);

          return (
            <div
              key={seg[0] ?? segIdx}
              ref={isActive ? activeRef : undefined}
              onClick={(e) => {
                // Ctrl/Cmd-click toggles multi-select; Shift-click extends a range.
                if (e.ctrlKey || e.metaKey) {
                  setMultiSel(prev => {
                    const next = new Set(prev);
                    if (next.has(segIdx)) next.delete(segIdx); else next.add(segIdx);
                    return next;
                  });
                  return;
                }
                if (e.shiftKey && selectedSegIdx !== null) {
                  const [a, b] = [Math.min(selectedSegIdx, segIdx), Math.max(selectedSegIdx, segIdx)];
                  setMultiSel(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)));
                  return;
                }
                if (multiSel.size) setMultiSel(new Set());
                handleCardClick(segIdx, first);
              }}
              onPointerDown={(e) => {
                // Drag across rows = range select (primary button on the card body only).
                if (e.button !== 0 || isEditing) return;
                if ((e.target as HTMLElement).closest('button, input, [draggable="true"]')) return;
                dragSelRef.current = { startIdx: segIdx, active: false };
              }}
              onPointerEnter={(e) => {
                const ds = dragSelRef.current;
                if (ds && e.buttons === 1 && ds.startIdx !== segIdx) {
                  ds.active = true;
                  const [a, b] = [Math.min(ds.startIdx, segIdx), Math.max(ds.startIdx, segIdx)];
                  setMultiSel(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)));
                }
              }}
              onDragOver={(e) => {
                if (chipDragFrom) { e.preventDefault(); setChipDragOver(segIdx); }
              }}
              onDragLeave={() => { if (chipDragOver === segIdx) setChipDragOver(null); }}
              onDrop={(e) => {
                e.preventDefault();
                setChipDragOver(null);
                if (chipDragFrom && segKey && chipDragFrom !== segKey && onLineOverride) {
                  // Copy the whole style bundle of the source line onto this one.
                  const src = lineOverrides[chipDragFrom];
                  if (src) onLineOverride(segKey, { ...src });
                }
                setChipDragFrom(null);
              }}
              className={`relative rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden ${
                isDropTarget ? 'border-emerald-400/70 bg-emerald-400/[0.07]' :
                isEditing  ? 'border-amber-400/50 bg-[#0f0f1a]' :
                inMultiSel ? 'border-amber-400/45 bg-amber-400/[0.07]' :
                isActive   ? 'border-yellow-400/25 bg-yellow-400/[0.04]' :
                isSelected ? 'border-amber-400/30 bg-amber-400/[0.05]' :
                             'border-white/[0.07] bg-white/[0.015] hover:border-white/[0.13] hover:bg-white/[0.03]'
              }`}
            >
              {/* Drop affordance while dragging a style chip over this row */}
              {isDropTarget && (
                <span className="absolute right-2 bottom-1.5 z-10 text-[8px] font-black tracking-[0.18em] text-emerald-300 bg-emerald-500/15 border border-emerald-400/40 rounded px-1.5 py-0.5 -rotate-6 pointer-events-none select-none">
                  SYNC LOOK
                </span>
              )}
              {/* Active left accent */}
              {isActive && !isEditing && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-yellow-400 rounded-r" />
              )}
              {isSelected && !isActive && !isEditing && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-400 rounded-r" />
              )}

              {/* Card header: index + merge arrows + timestamp */}
              <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-mono font-bold select-none ${
                    isEditing  ? 'text-amber-400' :
                    isActive   ? 'text-yellow-400' :
                    isSelected ? 'text-amber-400' :
                                 'text-zinc-600'
                  }`}>
                    {segIdx + 1}
                  </span>
                  {segIdx > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); onMergeWithPrev(segIdx); setSelectedSegIdx(null); }}
                      title="Merge this caption into the one above"
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] text-zinc-700 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer leading-none"
                    >
                      <ChevronUp className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {segIdx < segments.length - 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); onMergeWithNext(segIdx); setSelectedSegIdx(null); }}
                      title="Merge this caption into the one below"
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] text-zinc-700 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer leading-none"
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {first && (
                    <button
                      onClick={e => { e.stopPropagation(); onSeekTo?.(first.startMs); }}
                      className="text-[9px] font-mono text-zinc-600 hover:text-amber-400 transition-colors cursor-pointer select-none"
                    >
                      {fmtMs(first.startMs)}{last && last !== first ? ` → ${fmtMs(last.endMs)}` : ''}
                    </button>
                  )}
                  {/* Per-line template chip — drag onto another line to copy its style */}
                  {lineOv?.styleId && (
                    <span
                      draggable
                      onDragStart={e => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('text/captik-line-style', segKey ?? '');
                        setChipDragFrom(segKey ?? null);
                      }}
                      onDragEnd={() => { setChipDragFrom(null); setChipDragOver(null); }}
                      onClick={e => e.stopPropagation()}
                      title="This line has its own template — drag this chip onto another line to copy it"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 border border-emerald-400/30 text-[8px] font-black tracking-wider text-emerald-300 cursor-grab active:cursor-grabbing select-none"
                    >
                      ⚡ {chipLabel(lineOv.styleId)}
                    </span>
                  )}
                  {/* Line Styling popover trigger */}
                  {onLineOverride && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const keys = multiSel.size > 1 && multiSel.has(segIdx)
                          ? [...multiSel].sort((a, b) => a - b).map(i => segments[i]?.[0]).filter(Boolean) as string[]
                          : segKey ? [segKey] : [];
                        if (keys.length) setStylePopover({ x: rect.right + 8, y: rect.top - 8, segIdx, keys });
                      }}
                      title={multiSel.size > 1 && multiSel.has(segIdx)
                        ? `Style all ${multiSel.size} selected lines at once`
                        : 'Style just this line — font, position, template'}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        lineOv && Object.keys(lineOv).length
                          ? 'text-emerald-300 hover:bg-emerald-500/10'
                          : 'text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.08]'}`}
                    >
                      <LayoutPanelTop className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Words area */}
              <div className="px-2.5 pb-2.5">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(segIdx)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); commitEdit(segIdx); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditingIdx(null); }
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-white focus:outline-none border-b border-amber-400/60 pb-0.5 placeholder:text-zinc-600"
                    />
                    <Tooltip label="Split this caption in two at the cursor position">
                    <button
                      onMouseDown={e => { e.preventDefault(); handleSplit(segIdx); }}
                      aria-label="Split at cursor"
                      className="shrink-0 p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Scissors className="w-3 h-3" />
                    </button>
                    </Tooltip>
                  </div>
                ) : segWords.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {segWords.map(ww => {
                      const isEmph = (ww.styleOverride?.scale ?? 1) > 1;
                      const wColor = ww.styleOverride?.color;
                      const isActiveWord = currentTimeMs >= ww.startMs && currentTimeMs <= ww.endMs;
                      const chipCls = `inline-flex items-center px-1.5 py-0.5 rounded-md text-[13px] font-semibold leading-snug select-none transition-all ${
                        isEmph       ? 'bg-green-900/60 text-green-200 ring-1 ring-green-500/50' :
                        isActiveWord ? 'bg-yellow-400/15 text-yellow-200 ring-1 ring-yellow-400/25' :
                                       'text-zinc-200 hover:bg-white/[0.08] hover:text-white'
                      }`;
                      if (editingWordId === ww.id) {
                        return (
                          <span key={ww.id} className={`${chipCls} ring-1 ring-amber-400/60 bg-amber-400/10 p-0`}>
                            <input
                              ref={wordInputRef}
                              value={editingWordVal}
                              onChange={e => setEditingWordVal(e.target.value)}
                              onBlur={() => {
                                if (editingWordVal.trim()) onWordUpdate(ww.id, editingWordVal.trim());
                                setEditingWordId(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  { e.preventDefault(); if (editingWordVal.trim()) onWordUpdate(ww.id, editingWordVal.trim()); setEditingWordId(null); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingWordId(null); }
                              }}
                              onClick={e => e.stopPropagation()}
                              autoFocus
                              className="bg-transparent text-[13px] font-semibold text-white focus:outline-none px-1.5 py-0.5 min-w-[2ch]"
                              style={{ width: `${Math.max(editingWordVal.length + 1, 3)}ch` }}
                            />
                          </span>
                        );
                      }
                      return (
                        <span
                          key={ww.id}
                          onClick={e => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenu({
                              x: Math.min(rect.left, window.innerWidth - 210),
                              y: Math.min(rect.bottom + 5, window.innerHeight - 210),
                              wordId: ww.id,
                              segIdx,
                            });
                          }}
                          onDoubleClick={e => {
                            e.stopPropagation();
                            setMenu(null);
                            setEditingWordId(ww.id);
                            setEditingWordVal(ww.text);
                          }}
                          title="Click for actions · double-click to fix the spelling"
                          className={`${chipCls} cursor-pointer`}
                          style={!isEmph && wColor ? { color: wColor } : undefined}
                        >
                          {ww.text}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-zinc-600 italic text-xs">empty — click Edit to add text</span>
                )}
              </div>

              {/* Action bar — slides in when selected */}
              <AnimatePresence>
                {isSelected && !isEditing && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.13 }}
                    className="overflow-hidden"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-0.5 px-2 pb-2 pt-1 border-t border-white/[0.05]">
                      <Tooltip label="Rewrite this caption's text">
                      <button
                        onClick={() => startEdit(segIdx, text)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      </Tooltip>
                      <Tooltip label="Emphasize every word in this caption">
                      <button
                        onClick={() => { seg.forEach(id => onWordEmphasis(id)); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-400 hover:text-green-300 hover:bg-green-500/10 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" /> Emph
                      </button>
                      </Tooltip>
                      {segIdx > 0 && (
                        <Tooltip label="Join this caption with the one above">
                        <button
                          onClick={() => { onMergeWithPrev(segIdx); setSelectedSegIdx(null); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        >
                          <ChevronUp className="w-3 h-3" /> Merge ↑
                        </button>
                        </Tooltip>
                      )}
                      {segIdx < segments.length - 1 && (
                        <Tooltip label="Join this caption with the one below">
                        <button
                          onClick={() => { onMergeWithNext(segIdx); setSelectedSegIdx(null); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        >
                          <ChevronDown className="w-3 h-3" /> Merge ↓
                        </button>
                        </Tooltip>
                      )}
                      <Tooltip label="Delete this caption (Ctrl+Z undoes)">
                      <button
                        onClick={() => { onDeleteSegment(segIdx); setSelectedSegIdx(null); }}
                        aria-label="Delete caption"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer ml-auto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      </Tooltip>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Add line button */}
        <button
          onClick={onAddLine}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-dashed border-white/[0.08] text-[11px] text-zinc-600 hover:text-zinc-300 hover:border-white/[0.18] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add caption
        </button>
      </div>

      {/* Word context menu */}
      {menu && (() => {
        const mw          = wordMap.get(menu.wordId);
        const isEmph      = (mw?.styleOverride?.scale ?? 1) > 1;
        const isHighlight = !!mw?.styleOverride?.highlight;
        const seg         = segments[menu.segIdx] ?? [];
        const wordPos     = seg.indexOf(menu.wordId);
        // "Next line" splits: this word + after → new block. Requires words before it to stay.
        const canNextLine = wordPos > 0;
        // "Prev line" splits: up to this word → new block above. Requires words after it to stay.
        const canPrevLine = wordPos >= 0 && wordPos < seg.length - 1;
        return (
          <div
            ref={menuRef}
            className="fixed z-[9999] bg-[#1c1c2e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden py-1.5"
            style={{ top: menu.y, left: menu.x, minWidth: 210 }}
          >
            <button
              onClick={() => {
                setMenu(null);
                const mwEdit = wordMap.get(menu.wordId);
                if (mwEdit) { setEditingWordId(mwEdit.id); setEditingWordVal(mwEdit.text); }
              }}
              className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
              <div className="text-left flex-1">
                <p className="text-xs font-semibold leading-tight text-zinc-200">Edit word</p>
                <p className="text-[10px] text-zinc-600 leading-tight">Change the text of this word</p>
              </div>
            </button>
            <div className="h-px bg-white/[0.06] mx-2 my-0.5" />
            <button
              onClick={() => { onWordEmphasis(menu.wordId); setMenu(null); }}
              className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isEmph ? 'text-green-400' : 'text-zinc-500'}`} />
              <div className="text-left flex-1">
                <p className={`text-xs font-semibold leading-tight ${isEmph ? 'text-green-300' : 'text-zinc-200'}`}>
                  {isEmph ? 'Remove emphasis' : 'Emphasize'}
                </p>
                <p className="text-[10px] text-zinc-600 leading-tight">Make this word stand out</p>
              </div>
              {isEmph && <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />}
            </button>
            {(captionStyle === 'aura' || captionStyle === 'aura_helvetica') && (
              <button
                onClick={() => { onWordHighlight(menu.wordId); setMenu(null); }}
                className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Blend className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isHighlight ? 'text-yellow-400' : 'text-zinc-500'}`} />
                <div className="text-left flex-1">
                  <p className={`text-xs font-semibold leading-tight ${isHighlight ? 'text-yellow-300' : 'text-zinc-200'}`}>
                    {isHighlight ? 'Remove highlight' : 'Highlight'}
                  </p>
                  <p className="text-[10px] text-zinc-600 leading-tight">Trippy difference-blend colour</p>
                </div>
                {isHighlight && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 shrink-0" />}
              </button>
            )}
            {canNextLine && (
              <button
                onClick={() => { onNextLine(menu.segIdx, menu.wordId); setMenu(null); }}
                className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
                <div className="text-left flex-1">
                  <p className="text-xs font-semibold leading-tight text-zinc-200">Next line</p>
                  <p className="text-[10px] text-zinc-600 leading-tight">Split — this word starts a new block</p>
                </div>
              </button>
            )}
            {canPrevLine && (
              <button
                onClick={() => { onPrevLine(menu.segIdx, menu.wordId); setMenu(null); }}
                className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <ChevronUp className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
                <div className="text-left flex-1">
                  <p className="text-xs font-semibold leading-tight text-zinc-200">Previous line</p>
                  <p className="text-[10px] text-zinc-600 leading-tight">Split — this word ends a new block above</p>
                </div>
              </button>
            )}
          </div>
        );
      })()}

      {/* Per-line LINE STYLING popover (also bulk-applies to a multi-selection) */}
      {stylePopover && onLineOverride && (
        <LineStylingPopover
          anchor={{ x: stylePopover.x, y: stylePopover.y }}
          lineLabel={stylePopover.keys.length > 1 ? `${stylePopover.keys.length} lines` : `Line ${stylePopover.segIdx + 1}`}
          override={lineOverrides[stylePopover.keys[0]]}
          baseBox={captionBox ?? { xPercent: 50, yPercent: 85, widthPercent: 84 }}
          onPatch={patch => onLineOverride(stylePopover.keys, patch)}
          onClose={() => setStylePopover(null)}
        />
      )}
    </>
  );
}

// ── Hook Generator tab ────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy to clipboard'}>
    <button
      onClick={copy}
      aria-label="Copy to clipboard"
      className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
    </Tooltip>
  );
}

function HookTab({
  transcript, hookData, hookError, isLoading, onGenerate,
}: {
  transcript: string;
  hookData:   HookResponse | null;
  hookError:  string;
  isLoading:  boolean;
  onGenerate: () => void;
}) {
  const has3s = transcript.trim().split(/\s+/).length >= 5;

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/20 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <p className="text-xs font-bold text-white">3-Second Hook Strategy</p>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Analyse the opening of your video and generate an AI-optimised hook for maximum retention.
        </p>
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading || !has3s}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
          isLoading
            ? 'bg-amber-500/20 border border-amber-400/30 text-amber-400 cursor-wait'
            : !has3s
            ? 'bg-white/[0.04] border border-white/[0.07] text-zinc-600 cursor-not-allowed'
            : 'bg-gradient-to-r from-amber-500 to-orange-400 text-white shadow-lg shadow-amber-400/20 hover:from-amber-400 hover:to-orange-300'
        }`}
      >
        {isLoading ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
        ) : hookData ? (
          <><RefreshCw className="w-3.5 h-3.5" /> Regenerate</>
        ) : (
          <><Wand2 className="w-3.5 h-3.5" /> Generate Hook</>
        )}
      </button>

      {hookError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3">
          <p className="text-[11px] text-red-300 leading-relaxed">{hookError}</p>
        </div>
      )}

      {hookData && (
        <div className="flex flex-col gap-2">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Rewritten Hook</p>
              <CopyButton text={hookData.rewrittenScript} />
            </div>
            <p className="text-xs font-medium text-white leading-relaxed">&ldquo;{hookData.rewrittenScript}&rdquo;</p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">On-Screen Text</p>
              <CopyButton text={hookData.overlays.join('\n')} />
            </div>
            <div className="flex flex-col gap-1">
              {hookData.overlays.map((o, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-amber-400 font-mono shrink-0">{i + 1}.</span>
                  <span className="text-zinc-300">{o}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Visual Direction</p>
              <CopyButton text={hookData.visualDirection.join('\n')} />
            </div>
            <div className="flex flex-col gap-1">
              {hookData.visualDirection.map((v, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <ChevronRight className="w-3 h-3 text-orange-400 shrink-0 mt-0.5" />
                  <span className="text-zinc-300 leading-snug">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── B-Roll tab ────────────────────────────────────────────────────────────────

function BRollTab() {
  return (
    <div className="p-3 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mt-4">
        <Clapperboard className="w-5 h-5 text-zinc-600" />
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-400">B-Roll AI</p>
        <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
          Auto-suggest stock footage based on your transcript. Coming soon.
        </p>
      </div>
      <div className="w-full px-2 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-[10px] text-zinc-700">Join waitlist to get early access</p>
      </div>
    </div>
  );
}

