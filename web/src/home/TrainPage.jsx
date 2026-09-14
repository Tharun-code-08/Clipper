// Train the curator — ratings and the virality weights, as a Captik dashboard page.
import { useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { api } from '../format.js';
import { useModel } from './lib.js';
import { DISPLAY_FONT, PageHeader, SectionLabel, Spinner, card, ghostBtn, primaryBtn } from './ui.jsx';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function TrainPage() {
  const [m, reload] = useModel();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (!m) return <div className="flex flex-1 items-center justify-center bg-[#08080d]"><Spinner /></div>;

  const r = m.ratings;
  const canTrain = r.total >= 6 && r.liked >= 2 && r.disliked >= 2;
  const maxW = Math.max(...m.features.map((f) => Math.max(m.weights[f.key], m.defaults[f.key])));

  const train = async () => {
    setBusy(true);
    setMsg('Training…');
    try {
      const res = await api('/api/train', { method: 'POST', json: {} });
      await reload();
      setMsg(`Ranking accuracy on your ratings: ${pct(res.aucBefore)} → ${pct(res.aucAfter)}. New runs use these weights.`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    await api('/api/model/reset', { method: 'POST', json: {} }).catch(() => {});
    setMsg('Back to the default weights.');
    reload();
  };

  const stats = [
    [r.total, 'Ratings'],
    [r.liked, 'Good picks'],
    [r.disliked, 'Bad picks'],
    [m.trained ? `${pct(m.aucBefore)} → ${pct(m.aucAfter)}` : '—', 'Ranking accuracy'],
  ];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#08080d]">
      <PageHeader
        title="Train the curator"
        subtitle={m.trained ? `Trained ${new Date(m.trainedAt).toLocaleDateString()} on ${m.samples || r.total} ratings` : 'Using the default virality weights'}
        right={(
          <>
            {m.trained && <button type="button" onClick={reset} className={ghostBtn}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}
            <button type="button" onClick={train} disabled={!canTrain || busy} className={primaryBtn}>
              <Sparkles className="h-3.5 w-3.5" /> Train on {r.total} rating{r.total === 1 ? '' : 's'}
            </button>
          </>
        )}
      />
      <div className="flex-1 space-y-8 px-8 py-8">
        <p className="max-w-3xl text-[13px] leading-relaxed text-zinc-400">
          Every 👍 or 👎 you give a clip does two things. The next run shows the curator your good and bad picks as examples of
          your taste, and <span className="text-zinc-200">Train</span> re-fits how much each signal counts toward the virality
          score, pulled toward the defaults so a few ratings can't flip the model.
        </p>
        {msg ? <p className="text-[12px] text-amber-300/80">{msg}</p> : !canTrain && <p className="text-[12px] text-zinc-600">Training needs 6+ ratings with at least 2 good and 2 bad picks.</p>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(([value, label]) => (
            <div key={label} className={`${card} px-4 py-4`}>
              <p className="text-[22px] font-black tabular-nums text-white" style={DISPLAY_FONT}>{value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">{label}</p>
            </div>
          ))}
        </div>

        <div>
          <SectionLabel>What the score weighs</SectionLabel>
          <div className={`${card} space-y-2.5 p-4`}>
            {m.features.map((f) => (
              <div key={f.key} className="grid grid-cols-[160px_1fr_56px] items-center gap-3" title={f.hint}>
                <span className="truncate text-[12px] text-zinc-400">
                  {f.label}
                  <span className="ml-1.5 text-[10px] text-zinc-600">{f.source === 'llm' ? 'curator' : 'measured'}</span>
                </span>
                <span className="relative h-1.5 rounded-full bg-white/[0.06]">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${f.source === 'llm' ? 'bg-amber-400' : 'bg-sky-400/70'}`} style={{ width: `${(m.weights[f.key] / maxW) * 100}%` }} />
                  <span className="absolute -top-1 h-3.5 w-px bg-white/40" style={{ left: `${(m.defaults[f.key] / maxW) * 100}%` }} title="Default weight" />
                </span>
                <span className="text-right text-[12px] tabular-nums text-zinc-300">{(m.weights[f.key] * 100).toFixed(1)}%</span>
              </div>
            ))}
            <p className="pt-1 text-[10px] text-zinc-600">Amber: the curator's judgement · Blue: measured from audio and video · Tick: default weight</p>
          </div>
        </div>
      </div>
    </div>
  );
}
