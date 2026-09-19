'use client';

// The sound-effects library: browse and search the bank, audition a sound, drop it on the video at
// the playhead, then move it, nudge it, set its volume or remove it. Every sound is synthesized
// (license-free). Auditioning is what pulls the bank's audio, so a session that never opens this
// tab never downloads it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, Trash2, Crosshair, Minus, Music } from 'lucide-react';
import { clampSfxGain, newSfxInstance, SFX_GAIN_MAX, type SfxInstance } from '@/types/sfx';
import { sfxByGroup, sfxLabel } from '@/lib/sfx/sfxLibrary';
import { playSfx } from '@/lib/sfx/sfxPlayer';
import { loadSfx } from '@/lib/sfx/sfxLoader';
import { MUSIC_MAX_GAIN, type MusicTrack } from '@/types/music';
import { DUCK_DB_MIN } from '@/lib/music/duck';

export interface SfxTabProps {
  /** Sounds already placed on this project (SOURCE-clock ms). */
  sfx: readonly SfxInstance[];
  /** Playhead, SOURCE ms — new sounds land here. */
  currentTimeMs: number;
  durationMs: number;
  onAdd: (s: SfxInstance) => void;
  onUpdate: (id: string, patch: Partial<Pick<SfxInstance, 'atMs' | 'gain'>>) => void;
  onRemove: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (ms: number) => void;
  /** Sounds inside a removed Auto-Edit span won't be heard in the edited cut. */
  isCut?: (atMs: number) => boolean;
  /** Background music: the project's one track, or null. */
  music?: MusicTrack | null;
  /** True once the track's audio has been read back out of local storage. */
  musicReady?: boolean;
  /** Returns an error message, or null when the file was accepted. */
  onMusicPick?: (file: File) => Promise<string | null>;
  onMusicChange?: (patch: Partial<MusicTrack>) => void;
  onMusicRemove?: () => void;
}

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};

export default function SfxTab({
  sfx, currentTimeMs, durationMs, onAdd, onUpdate, onRemove, selectedId, onSelect, onSeek, isCut,
  music, musicReady, onMusicPick, onMusicChange, onMusicRemove,
}: SfxTabProps) {
  const [query, setQuery] = useState('');
  const [musicError, setMusicError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickMusic = async (file: File | undefined) => {
    if (!file || !onMusicPick) return;
    setMusicError(await onMusicPick(file));
  };

  // Warm the bank when the tab opens so the first audition is instant rather than a beat late.
  useEffect(() => { void loadSfx().catch(() => {}); }, []);

  const groups = useMemo(() => sfxByGroup(query), [query]);
  const placed = useMemo(() => [...sfx].sort((a, b) => a.atMs - b.atMs), [sfx]);
  const clampMs = (ms: number) => Math.max(0, Math.min(durationMs > 0 ? durationMs : ms, Math.round(ms)));

  const place = (id: string) => {
    const inst = newSfxInstance(id, clampMs(currentTimeMs));
    onAdd(inst);
    onSelect(inst.id);
    playSfx(id, inst.gain);
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3" data-testid="sfx-tab">
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Tap a sound to add it at the playhead. All sounds are original and free to use.
      </p>

      {onMusicPick && (
        <div className="space-y-1.5" data-testid="music-section">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-0.5">Background music</p>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              aria-label="Choose a music track"
              onChange={(e) => { void pickMusic(e.target.files?.[0]); e.target.value = ''; }}
            />
            {!music ? (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  data-testid="music-add"
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] py-2 text-[11.5px] font-semibold text-zinc-200 cursor-pointer"
                >
                  <Music className="w-3.5 h-3.5" /> Add your own track
                </button>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  It plays under the whole video and steps back automatically whenever you speak.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Music className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span className="text-[11px] text-white truncate flex-1" title={music.name}>{music.name}</span>
                  <button
                    onClick={() => { onMusicRemove?.(); setMusicError(null); }}
                    data-testid="music-remove"
                    title="Remove music" aria-label="Remove music"
                    className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-rose-300 cursor-pointer"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {!musicReady && <p className="text-[10px] text-zinc-500">Loading the track…</p>}
                <label className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 w-12 shrink-0">Volume</span>
                  <input
                    type="range" min={0} max={MUSIC_MAX_GAIN} step={0.05} value={music.gain}
                    aria-label="Music volume"
                    onChange={(e) => onMusicChange?.({ gain: Number(e.target.value) })}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-zinc-700"
                    style={{ accentColor: '#f59e0b' }}
                  />
                  <span className="text-[10px] text-zinc-400 w-8 text-right tabular-nums">{Math.round(music.gain * 100)}%</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 w-12 shrink-0">Duck</span>
                  <input
                    type="range" min={DUCK_DB_MIN} max={0} step={1} value={music.duckDb}
                    aria-label="Duck music under speech"
                    onChange={(e) => onMusicChange?.({ duckDb: Number(e.target.value) })}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-zinc-700"
                    style={{ accentColor: '#f59e0b' }}
                  />
                  <span className="text-[10px] text-zinc-400 w-8 text-right tabular-nums">{music.duckDb} dB</span>
                </label>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  {music.duckDb === 0 ? 'The music stays at one level under your voice.' : 'The music drops while you speak and comes back in the gaps.'}
                </p>
              </>
            )}
            {musicError && <p className="text-[10.5px] text-rose-300 leading-relaxed">{musicError}</p>}
          </div>
        </div>
      )}

      {placed.length > 0 && (
        <div className="space-y-1.5" data-testid="sfx-placed">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-0.5">On your video ({placed.length})</p>
          {placed.map((s) => {
            const sel = selectedId === s.id;
            const cut = isCut?.(s.atMs) ?? false;
            return (
              <div
                key={s.id}
                onClick={() => { onSelect(s.id); onSeek(s.atMs); }}
                className={`rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ${
                  sel ? 'bg-amber-400/10 border-amber-400/40' : 'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); playSfx(s.sfxId, s.gain); }}
                    title="Preview" aria-label="Preview sound"
                    className="text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                  ><Play className="w-3 h-3" /></button>
                  <span className="text-[11px] text-white truncate flex-1">{s.label ?? sfxLabel(s.sfxId)}</span>
                  {cut && <span className="text-[9px] text-rose-300/80" title="This moment is removed by Auto-Edit">cut</span>}
                  <span className="text-[9.5px] text-zinc-500 font-mono tabular-nums">{fmt(s.atMs)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(s.id); }}
                    title="Remove" aria-label="Remove sound"
                    className="text-zinc-500 hover:text-red-400 cursor-pointer"
                  ><Trash2 className="w-3 h-3" /></button>
                </div>
                {sel && (
                  <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onUpdate(s.id, { atMs: clampMs(s.atMs - 100) })}
                        className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 cursor-pointer" aria-label="Move 0.1 seconds earlier" title="0.1s earlier"
                      ><Minus className="w-3 h-3" /></button>
                      <button
                        onClick={() => onUpdate(s.id, { atMs: clampMs(s.atMs + 100) })}
                        className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 cursor-pointer" aria-label="Move 0.1 seconds later" title="0.1s later"
                      ><Plus className="w-3 h-3" /></button>
                      <button
                        onClick={() => onUpdate(s.id, { atMs: clampMs(currentTimeMs) })}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-zinc-300 cursor-pointer"
                      ><Crosshair className="w-3 h-3" /> Move to playhead</button>
                    </div>
                    <label className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 w-10">Volume</span>
                      <input
                        type="range" min={0} max={SFX_GAIN_MAX} step={0.05} value={s.gain}
                        aria-label="Sound volume"
                        onChange={(e) => onUpdate(s.id, { gain: clampSfxGain(Number(e.target.value)) })}
                        className="flex-1 h-1 accent-amber-500 cursor-pointer"
                      />
                      <span className="text-[10px] text-zinc-400 font-mono w-8 text-right">{Math.round(s.gain * 100)}%</span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search sounds (whoosh, boom, money…)"
        aria-label="Search sounds"
        className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-[11.5px] text-white placeholder:text-zinc-600 outline-none focus:border-white/20"
      />

      {groups.map((g) => (
        <div key={g.key} className="space-y-1">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-0.5">{g.label}</p>
          {g.sounds.map((s) => (
            <div
              key={s.id}
              onClick={() => place(s.id)}
              title="Add at the playhead"
              data-sfx-id={s.id}
              className="group flex items-center gap-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.08] px-2 py-1.5 cursor-pointer"
            >
              <button
                onClick={(e) => { e.stopPropagation(); playSfx(s.id, 0.9); }}
                title="Preview" aria-label={`Preview ${s.label}`}
                className="text-zinc-400 hover:text-white shrink-0 cursor-pointer"
              ><Play className="w-3 h-3" /></button>
              <span className="flex-1 text-[11px] text-zinc-200 truncate">{s.label}</span>
              {/* Always visible: there is no hover on touch. */}
              <span className="flex items-center gap-0.5 text-[10px] text-amber-300/70 group-hover:text-amber-200 shrink-0">
                <Plus className="w-3 h-3" />Add
              </span>
            </div>
          ))}
        </div>
      ))}
      {groups.length === 0 && (
        <p className="text-[11px] text-zinc-500 text-center py-6">Nothing matches “{query.trim()}”.</p>
      )}
    </div>
  );
}
