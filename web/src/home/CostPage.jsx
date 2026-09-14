// Cost per video — the estimator, laid out as a Captik dashboard page with Captik's own slider rows.
import { useEffect, useState } from 'react';
import { SliderRow } from '@/components/editor/panel/controls';
import { api } from '../format.js';
import { inr, labelOf, usd, usd3 } from './lib.js';
import { DISPLAY_FONT, FieldLabel, PageHeader, SectionLabel, Select, Spinner, card } from './ui.jsx';

export default function CostPage({ health }) {
  const [minutes, setMinutes] = useState(20);
  const [clips, setClips] = useState(10);
  const [model, setModel] = useState(null);
  const [sttModel, setSttModel] = useState(null);
  const [est, setEst] = useState(null);

  useEffect(() => {
    if (!health) return;
    setModel((m) => m || health.defaults.model);
    setSttModel((s) => s || health.defaults.sttModel);
  }, [health]);

  useEffect(() => {
    if (!model || !sttModel) return undefined;
    const t = setTimeout(() => {
      api(`/api/estimate?${new URLSearchParams({ minutes: String(minutes), model, sttModel, maxClips: String(clips) })}`).then(setEst).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [minutes, clips, model, sttModel]);

  const maxCompare = est ? Math.max(...est.compare.map((c) => c.usd)) : 1;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#08080d]">
      <PageHeader title="Cost per video" subtitle="What clipping one long video costs, calibrated from your finished runs" />
      <div className="grid flex-1 items-start gap-6 px-8 py-8 lg:grid-cols-[320px_1fr]">
        <div>
          <SectionLabel>Video</SectionLabel>
          <div className={`${card} space-y-4 p-4`}>
            <SliderRow label="Length" value={minutes} min={5} max={180} step={5} onChange={setMinutes} display={(v) => `${v} min`} defaultValue={20} />
            <SliderRow label="Clips" value={clips} min={1} max={health?.maxClips || 10} step={1} onChange={setClips} display={(v) => String(v)} defaultValue={10} />
            <div>
              <FieldLabel>Who picks the clips?</FieldLabel>
              <Select value={model || ''} onChange={setModel} options={(health?.models || []).map((m) => ({ value: m, label: labelOf(m) }))} disabled={!health} />
            </div>
            <div>
              <FieldLabel>Transcribed by</FieldLabel>
              <Select value={sttModel || ''} onChange={setSttModel} options={(health?.sttModels || []).map((m) => ({ value: m, label: labelOf(m) }))} disabled={!health} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {!est ? (
            <div className={`${card} flex items-center justify-center py-16`}><Spinner /></div>
          ) : (
            <>
              <div>
                <SectionLabel>One {minutes}-minute video, {clips} clip{clips === 1 ? '' : 's'}</SectionLabel>
                <div className={`${card} p-5`}>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-[40px] font-black leading-none tabular-nums text-white" style={DISPLAY_FONT}>{usd(est.usd)}</span>
                    <span className="text-[13px] tabular-nums text-zinc-400">≈ {inr(est.inr)}</span>
                    <span className="text-[13px] tabular-nums text-zinc-600">{usd3(est.perClipUsd)} per clip</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 border-t border-white/[0.06] pt-4">
                    {est.items.map((i, k) => (
                      <li key={k} className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-zinc-300">{i.stage} <span className="text-zinc-600">· {i.provider}{i.model?.startsWith('claude') ? ` ${labelOf(i.model)}` : ''}</span></p>
                          <p className="text-[10px] text-zinc-600">{i.detail}</p>
                        </div>
                        <span className="text-[12px] tabular-nums text-zinc-300">
                          {i.usd ? usd3(i.usd) : <>$0 <span className="text-zinc-600">({usd3(i.hostedUsd)} hosted)</span></>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <SectionLabel>Same video, other curators</SectionLabel>
                <div className={`${card} space-y-2.5 p-4`}>
                  {est.compare.map((c) => (
                    <div key={c.model} className="grid grid-cols-[140px_1fr_64px] items-center gap-3">
                      <span className={`truncate text-[12px] ${c.model === est.model ? 'text-amber-300' : 'text-zinc-400'}`}>{labelOf(c.model)}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className={`block h-full rounded-full ${c.model === est.model ? 'bg-amber-400' : 'bg-white/25'}`} style={{ width: `${(c.usd / maxCompare) * 100}%` }} />
                      </span>
                      <span className="text-right text-[12px] tabular-nums text-zinc-300">{usd(c.usd)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="max-w-3xl text-[11px] leading-relaxed text-zinc-600">
                {est.basis === 'measured'
                  ? `Calibrated from ${est.calibrationRuns} finished run${est.calibrationRuns === 1 ? '' : 's'} on this machine (tokens and render time). Hindi transcripts use more tokens than English.`
                  : 'An estimate until your first run finishes; after that it uses measured tokens and render times.'}
                {` ₹ at ${est.usdInr}/$. Hosted = ffmpeg and render time on a $${est.hostedCpuUsdPerHour}/hr 8-vCPU box.`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
