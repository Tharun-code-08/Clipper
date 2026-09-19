'use client';

// Cover controls — the left-panel tab (desktop) and the Cover sheet (mobile).

import { useMemo } from 'react';
import { Download, Loader2, Crosshair, Lock, UserRound, Sparkles } from 'lucide-react';
import { CAPTION_STYLES } from '@/lib/captionStyles';
import { COVER_PRESETS, COVER_MAX_CHARS, COVER_FONT_SCALE_MIN, COVER_FONT_SCALE_MAX, COVER_ZOOM_MAX, isCoverStyleSupported } from '@/lib/cover/coverLayout';
import type { CoverEditor } from './useCoverEditor';

function fmtTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-500">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-400 cursor-pointer"
        aria-label={label}
      />
    </label>
  );
}

export default function CoverPanel({ editor, hookOverlays, currentTimeMs }: {
  editor: CoverEditor;
  hookOverlays?: string[];
  currentTimeMs: number;
}) {
  const { settings: s, update, stageProps } = editor;
  const styles = useMemo(() => CAPTION_STYLES.filter(d => isCoverStyleSupported(d.id)), []);
  const pct = (v: number) => `${Math.round(v)}%`;

  return (
    <div className="p-3 flex flex-col gap-5" data-cover-panel="">
      <Section title="Size">
        <div className="grid grid-cols-3 gap-1.5">
          {COVER_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => editor.setPreset(p.id)}
              aria-pressed={s.preset === p.id}
              className={`rounded-lg px-1.5 py-2 text-center border transition-colors cursor-pointer ${
                s.preset === p.id ? 'bg-amber-500/15 border-amber-400/40 text-amber-200' : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="block text-[11px] font-semibold leading-tight">{p.label}</span>
              <span className="block text-[9px] text-zinc-500 mt-0.5">{p.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Frame"
        right={editor.frame && <span className="text-[10px] font-mono text-zinc-500">{fmtTime(editor.frame.tMs)}</span>}
      >
        <button
          onClick={editor.useCurrentFrame}
          disabled={editor.frameStatus === 'capturing'}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] border border-white/[0.1] text-white hover:bg-white/[0.1] disabled:opacity-50 cursor-pointer"
        >
          {editor.frameStatus === 'capturing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
          Use current frame ({fmtTime(currentTimeMs)})
        </button>
        {editor.locked ? (
          <p className="text-[11px] text-zinc-500 leading-snug flex items-center gap-1.5">
            <Lock className="w-3 h-3 shrink-0" /> Frame locked.
            <button onClick={editor.followPlayhead} className="text-amber-300 hover:underline cursor-pointer">Follow the timeline instead</button>
          </p>
        ) : (
          <p className="text-[11px] text-zinc-500 leading-snug">Scrub the timeline — the cover follows it. Tap the button to lock a frame.</p>
        )}
        {editor.frameError && <p className="text-[11px] text-red-300">{editor.frameError}</p>}
      </Section>

      <Section title="Headline" right={<span className="text-[10px] text-zinc-600">{s.text.length}/{COVER_MAX_CHARS}</span>}>
        <textarea
          value={s.text}
          onChange={(e) => editor.setText(e.target.value)}
          maxLength={COVER_MAX_CHARS}
          rows={2}
          placeholder="Your headline"
          aria-label="Cover headline"
          className="w-full resize-none rounded-lg bg-black/30 border border-white/[0.08] px-2.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/50"
        />
        {!!hookOverlays?.length && (
          <div className="flex flex-wrap gap-1.5">
            {hookOverlays.filter(Boolean).map((o, i) => (
              <button
                key={i}
                onClick={() => editor.setText(o, true)}
                className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/20 cursor-pointer"
                title="Use this AI hook line"
              >
                <Sparkles className="w-2.5 h-2.5" /> {o}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Template">
        <div className="grid grid-cols-2 gap-1.5">
          {styles.map(d => {
            const active = stageProps.styleId === d.id;
            return (
              <button
                key={d.id}
                onClick={() => update({ styleId: d.id })}
                aria-pressed={active}
                title={d.name}
                className={`relative h-[62px] rounded-lg overflow-hidden border bg-zinc-950 cursor-pointer transition-colors ${
                  active ? 'border-amber-400/70 ring-1 ring-amber-400/40' : 'border-white/[0.07] hover:border-white/20'
                }`}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transform: 'scale(0.55)' }}>
                  {d.renderPreview ? d.renderPreview() : <span style={d.textStyle}>{d.previewText}</span>}
                </div>
                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-zinc-300 py-0.5 truncate px-1">{d.name}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-600 leading-snug">
          Templates with glass, gradient or blend effects (Hormozi, Aura, Illusion, Big Reveal and a few more), and one-word-at-a-time templates, can&apos;t be used for covers yet.
        </p>
      </Section>

      <Section title="Text size & position">
        <Slider label="Size" value={s.fontScale} min={COVER_FONT_SCALE_MIN} max={COVER_FONT_SCALE_MAX} step={0.05}
          onChange={(v) => update({ fontScale: v })} format={(v) => `${v.toFixed(2)}×`} />
        {/* Moving the headline by hand is a placement decision: it stops the automatic subject avoidance. */}
        <Slider label="Vertical" value={s.box.yPercent} min={5} max={95} step={1}
          onChange={(v) => update({ box: { ...s.box, yPercent: v }, boxAuto: false })} format={pct} />
        <Slider label="Horizontal" value={s.box.xPercent} min={10} max={90} step={1}
          onChange={(v) => update({ box: { ...s.box, xPercent: v }, boxAuto: false })} format={pct} />
        <Slider label="Width" value={s.box.widthPercent} min={30} max={100} step={1}
          onChange={(v) => update({ box: { ...s.box, widthPercent: v }, boxAuto: false })} format={pct} />
        {editor.subjectShown && (s.boxAuto ? (
          <div className="flex flex-col gap-1" data-cover-clear="auto">
            <p className="text-[11px] text-zinc-500 leading-snug flex items-start gap-1.5">
              <UserRound className="w-3 h-3 mt-0.5 shrink-0" />
              Placed clear of the subject. Move it yourself and it stays where you put it.
            </p>
            {editor.headlineCoverage != null && editor.headlineCoverage > 0.15 && (
              <p className="text-[11px] text-amber-300/90 leading-snug">
                The subject fills most of the frame, so it still hides part of the headline. Try a smaller size or another frame.
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={editor.clearOfSubject}
            data-cover-clear="manual"
            className="self-start flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.09] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-white/[0.09] cursor-pointer"
          >
            <UserRound className="w-3 h-3" /> Move headline clear of the subject
          </button>
        ))}
      </Section>

      <Section title="Crop">
        <Slider label="Zoom" value={s.zoom} min={1} max={COVER_ZOOM_MAX} step={0.05}
          onChange={(v) => update({ zoom: v })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Left ↔ right" value={s.panX} min={0} max={1} step={0.01}
          onChange={(v) => update({ panX: v })} format={(v) => pct(v * 100)} />
        <Slider label="Top ↕ bottom" value={s.panY} min={0} max={1} step={0.01}
          onChange={(v) => update({ panY: v })} format={(v) => pct(v * 100)} />
      </Section>

      <Section title="Subject">
        <label className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5 cursor-pointer">
          <span className="flex items-center gap-2 text-xs text-zinc-200">
            <UserRound className="w-3.5 h-3.5 text-zinc-400" />
            Subject in front of text
          </span>
          <span className="flex items-center gap-1.5">
            {editor.cutoutStatus === 'working' && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
            <input
              type="checkbox"
              checked={s.subjectInFront}
              disabled={!editor.frame || editor.cutoutStatus === 'working'}
              onChange={(e) => editor.setSubjectInFront(e.target.checked)}
              className="w-4 h-4 accent-amber-400 cursor-pointer"
              aria-label="Subject in front of text"
            />
          </span>
        </label>
        {editor.cutoutError
          ? <p role="alert" className="text-[11px] text-red-300 leading-snug">{editor.cutoutError}</p>
          : <p className="text-[10px] text-zinc-600 leading-snug">Cuts the person out of this frame on your device and places them over the headline. The first use downloads a ~16 MB model.</p>}
      </Section>

      <Section title="Download">
        <div className="grid grid-cols-2 gap-1.5">
          {(['png', 'jpeg'] as const).map(f => (
            <button
              key={f}
              onClick={() => update({ format: f })}
              aria-pressed={s.format === f}
              className={`rounded-lg py-1.5 text-[11px] font-semibold border cursor-pointer ${
                s.format === f ? 'bg-amber-500/15 border-amber-400/40 text-amber-200' : 'bg-white/[0.03] border-white/[0.07] text-zinc-400'
              }`}
            >
              {f === 'png' ? 'PNG' : 'JPG'}
            </button>
          ))}
        </div>
        <button
          onClick={() => void editor.download()}
          disabled={!editor.canDownload}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-400 text-white shadow-lg shadow-amber-400/20 hover:from-amber-400 hover:to-orange-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {editor.downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {editor.downloading ? 'Creating image…' : `Download ${s.format === 'png' ? 'PNG' : 'JPG'}`}
        </button>
        {editor.downloadError && <p className="text-[11px] text-red-300">{editor.downloadError}</p>}
        {editor.watermarked && (
          <p className="text-[10px] text-zinc-500 leading-snug">Free covers include a small Captik watermark. Any paid plan, or unlocking this project, removes it.</p>
        )}
      </Section>
    </div>
  );
}
