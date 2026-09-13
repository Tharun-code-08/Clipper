const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const postJson = (url, body) => api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });

const LABELS = {
  'claude-opus-5': 'Claude Opus 5',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'whisper-large-v3': 'Whisper large-v3',
  'whisper-large-v3-turbo': 'Whisper v3 turbo',
};
const HOSTS = [
  ['youtube', ['youtube.com', 'youtu.be']], ['gdrive', ['drive.google.com', 'docs.google.com']], ['instagram', ['instagram.com']],
  ['tiktok', ['tiktok.com']], ['x', ['x.com', 'twitter.com']], ['facebook', ['facebook.com', 'fb.watch']], ['linkedin', ['linkedin.com']],
  ['vimeo', ['vimeo.com']], ['reddit', ['reddit.com', 'redd.it']], ['twitch', ['twitch.tv']], ['dropbox', ['dropbox.com']],
];

const state = { health: null, model: null, file: null, maxClips: 10, jobId: null, job: null, es: null, clipEls: new Map(), timelineKey: '' };

const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const usd = (v) => (v == null ? '—' : `$${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(3)}`);
const inr = (v) => (v == null ? '—' : `₹${v.toFixed(2)}`);
const slug = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'clip';

function detectPlatform(value) {
  try {
    const u = new URL(value.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const hit = HOSTS.find(([, hosts]) => hosts.some((h) => host === h || host.endsWith(`.${h}`)));
    if (hit) return state.health?.platforms.find((p) => p.id === hit[0]) || { id: hit[0], label: hit[0] };
    if (/\.(mp4|mov|m4v|webm|mkv)$/i.test(u.pathname)) return { id: 'direct', label: 'Direct file' };
    return { id: 'web', label: 'Try it' };
  } catch {
    return null;
  }
}

/* ---------------- health + options ---------------- */
async function loadHealth() {
  const h = await api('/api/health');
  state.health = h;
  $('#health').innerHTML = [
    `<span class="${h.ffmpeg ? '' : 'bad'}">ffmpeg ${esc(h.ffmpeg ? h.ffmpeg.split('-')[0] : 'missing')}</span>`,
    `<span class="${h.ytdlp ? '' : 'bad'}">yt-dlp ${esc(h.ytdlp || 'missing')}</span>`,
    `<span class="${h.anthropicKey ? '' : 'bad'}">Claude</span>`,
    `<span class="${h.groqKey ? '' : 'bad'}">Groq</span>`,
    `<span class="cap">max ${h.maxClips} clips / video</span>`,
  ].join('');
  const fill = (sel, list, def) => { $(sel).innerHTML = list.map((m) => `<option value="${m}" ${m === def ? 'selected' : ''}>${LABELS[m] || m}</option>`).join(''); };
  fill('#model', h.models, h.defaults.model);
  fill('#sttModel', h.sttModels, h.defaults.sttModel);
  $('#platforms').innerHTML = h.platforms.map((p) => `<li data-id="${p.id}">${esc(p.label)}</li>`).join('');
}

/* ---------------- intake ---------------- */
function setupIntake() {
  const url = $('#url');
  const chip = $('#platformChip');
  const drop = $('#drop');
  const fileInput = $('#file');

  url.addEventListener('input', () => {
    if (url.value) clearFile();
    const p = url.value ? detectPlatform(url.value) : null;
    chip.hidden = !p;
    if (p) { chip.textContent = p.label; chip.classList.toggle('warn', p.id === 'web'); }
    document.querySelectorAll('#platforms li').forEach((li) => li.classList.toggle('on', li.dataset.id === p?.id));
  });

  const setFile = (f) => {
    if (!f) return;
    state.file = f;
    url.value = '';
    chip.hidden = true;
    drop.classList.add('has');
    $('#dropText').textContent = `${f.name} · ${(f.size / 1024 ** 2).toFixed(0)} MB`;
  };
  function clearFile() {
    state.file = null;
    fileInput.value = '';
    drop.classList.remove('has');
    $('#dropText').textContent = 'or drop a video file here';
  }
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));

  document.querySelectorAll('.stepper button').forEach((b) => b.addEventListener('click', () => {
    state.maxClips = Math.min(10, Math.max(1, state.maxClips + Number(b.dataset.step)));
    $('#maxClipsOut').textContent = state.maxClips;
    refreshEstimate();
  }));
  $('#model').addEventListener('change', refreshEstimate);
  $('#sttModel').addEventListener('change', refreshEstimate);

  $('#intakeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#formError');
    const go = $('#go');
    err.hidden = true;
    const opts = { maxClips: state.maxClips, model: $('#model').value, sttModel: $('#sttModel').value, captions: $('#captions').checked };
    if (!state.file && !detectPlatform(url.value)) {
      err.textContent = 'Paste a full link (https://…) or drop a video file.';
      err.hidden = false;
      return;
    }
    go.disabled = true;
    try {
      let id;
      if (state.file) {
        const fd = new FormData();
        Object.entries(opts).forEach(([k, v]) => fd.append(k, String(v)));
        fd.append('file', state.file);
        id = (await uploadWithProgress(fd, (p) => { go.firstElementChild.textContent = `Uploading ${Math.round(p * 100)}%`; })).id;
      } else {
        id = (await postJson('/api/jobs', { url: url.value.trim(), ...opts })).id;
      }
      clearFile();
      url.value = '';
      chip.hidden = true;
      location.hash = `#/job/${id}`;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      go.disabled = false;
      go.firstElementChild.textContent = 'Clip it';
    }
  });
}

function uploadWithProgress(fd, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      return xhr.status < 300 ? resolve(data) : reject(new Error(data.error || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: the server is unreachable.'));
    xhr.send(fd);
  });
}

/* ---------------- estimator ---------------- */
let estTimer;
function refreshEstimate() {
  clearTimeout(estTimer);
  estTimer = setTimeout(async () => {
    const minutes = $('#estMinutes').value;
    $('#estMinutesOut').textContent = minutes;
    const q = new URLSearchParams({ minutes, model: $('#model').value, sttModel: $('#sttModel').value, maxClips: state.maxClips });
    const est = await api(`/api/estimate?${q}`).catch(() => null);
    if (!est) return;
    $('#estTotal').innerHTML = `<b>${usd(est.usd)}</b><span>≈ ${inr(est.inr)} · ${usd(est.perClipUsd)} per clip</span>`;
    $('#estItems').innerHTML = est.items.map((i) => `
      <div><span>${esc(i.stage)} · ${esc(i.provider)}${i.model ? ` ${esc(LABELS[i.model] || i.model)}` : ''}</span>
      <span>${i.usd ? usd(i.usd) : `$0 <em style="color:var(--paper-faint);font-style:normal">(${usd(i.hostedUsd)} hosted)</em>`}</span>
      <small>${esc(i.detail)}</small></div>`).join('');
    const max = Math.max(...est.compare.map((c) => c.usd));
    $('#estCompare').innerHTML = est.compare.map((c) => `
      <div class="${c.model === est.model ? 'sel' : ''}"><span>${esc(LABELS[c.model] || c.model)}</span><i style="width:${(c.usd / max) * 100}%"></i><span>${usd(c.usd)}</span></div>`).join('');
    $('#estBasis').textContent = est.basis === 'measured'
      ? `Calibrated from ${est.calibrationRuns} real run${est.calibrationRuns > 1 ? 's' : ''} on this machine (tokens, render time). Hindi and other Devanagari transcripts use more tokens than English. ₹ at ${est.usdInr}/$; hosted = ffmpeg time on a $${est.hostedCpuUsdPerHour}/hr 8-vCPU box.`
      : `Estimated until your first run finishes; after that it uses measured token counts and render times. ₹ at ${est.usdInr}/$; hosted = ffmpeg time on a $${est.hostedCpuUsdPerHour}/hr 8-vCPU box.`;
  }, 120);
}

/* ---------------- job view ---------------- */
function openJob(id) {
  if (state.es) state.es.close();
  if (state.jobId !== id) {
    state.clipEls.clear();
    $('#clips').innerHTML = '';
    state.timelineKey = '';
  }
  state.jobId = id;
  $('#jobView').hidden = false;
  state.es = new EventSource(`/api/jobs/${id}/events`);
  state.es.onmessage = (e) => {
    const job = JSON.parse(e.data);
    const wasRunning = state.job?.id === job.id && !['done', 'error'].includes(state.job.status);
    state.job = job;
    renderJob(job);
    if (['done', 'error'].includes(job.status)) {
      state.es.close();
      if (wasRunning) { loadHistory(); loadModel(); refreshEstimate(); }
    }
  };
  state.es.onerror = () => { if (state.job?.status === 'done' || state.job?.status === 'error') state.es.close(); };
  requestAnimationFrame(() => $('#jobView').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelectorAll('#history a').forEach((a) => a.classList.toggle('sel', a.dataset.id === id));
}

function renderJob(job) {
  const src = job.source;
  const title = src?.title || job.input.url || job.input.fileName || 'New job';
  const bits = src
    ? [src.platformLabel, fmtTime(src.duration), `${src.width}×${src.height}`, src.language, src.uploader].filter(Boolean)
    : [job.input.kind === 'url' ? job.input.url : job.input.fileName];
  const canRecurate = src && ['done', 'error'].includes(job.status);
  $('#jobHead').innerHTML = `
    <div>
      <p class="kicker">${job.input.kind === 'recurate' ? 'Re-curation run' : 'Job'} · ${esc(job.id)}</p>
      <h2>${esc(title)}</h2>
      <p class="sub">${bits.map(esc).join(' · ')} · curator ${esc(LABELS[job.input.model] || job.input.model)} · max ${job.input.maxClips} clips</p>
      ${job.summary ? `<p class="summary">${esc(job.summary)}</p>` : ''}
      ${job.error ? `<p class="summary" style="color:var(--rec)">${esc(job.error)}</p>` : ''}
    </div>
    <div class="head-actions">
      <span class="status-pill ${job.status}">${job.status}</span>
      ${src?.url ? `<a class="btn" href="${esc(src.url)}" target="_blank" rel="noopener">Source ↗</a>` : ''}
      <button class="btn primary" id="recurate" ${canRecurate ? '' : 'disabled'} title="Run curation again on the saved transcript, guided by your ratings">Re-curate with my ratings</button>
    </div>`;
  $('#recurate').onclick = async () => {
    try {
      const { id } = await postJson(`/api/jobs/${job.id}/recurate`, { maxClips: state.maxClips, model: $('#model').value });
      location.hash = `#/job/${id}`;
    } catch (ex) { alertInline(ex.message); }
  };

  renderStages(job);
  renderConsole(job);
  renderReceipt(job);
  renderTimeline(job);
  renderClips(job);

  const rej = $('#rejected');
  rej.hidden = !job.rejected?.length;
  if (job.rejected?.length) {
    rej.querySelector('summary').textContent = `${job.rejected.length} proposed moment${job.rejected.length > 1 ? 's' : ''} rejected by the validator`;
    rej.querySelector('ul').innerHTML = job.rejected.map((r) => `<li>${esc(r.title)} — ${esc(r.reason)}</li>`).join('');
  }
}

function alertInline(msg) {
  const el = document.createElement('p');
  el.className = 'form-error';
  el.textContent = msg;
  $('#jobHead').append(el);
  setTimeout(() => el.remove(), 6000);
}

function renderStages(job) {
  const stages = state.health?.stages || [];
  $('#stages').innerHTML = stages.map((s, i) => {
    const st = job.stages[s.key] || {};
    let t = '';
    if (st.note) t = st.note;
    else if (st.status === 'running' && st.startedAt) t = `${Math.round((Date.now() - st.startedAt) / 1000)} s${st.phase ? ` · ${st.phase}` : ''}`;
    else if (st.status === 'done' && st.startedAt && st.endedAt) t = `${((st.endedAt - st.startedAt) / 1000).toFixed(st.endedAt - st.startedAt < 10000 ? 1 : 0)} s`;
    const pct = st.status === 'done' ? 100 : Math.round((st.progress || 0) * 100);
    return `<li class="stage ${st.status || 'pending'}"><span class="n">0${i + 1}</span><span class="l">${esc(s.label)}</span><span class="t">${esc(t)}</span><i class="bar" style="width:${pct}%"></i></li>`;
  }).join('');
}

function renderConsole(job) {
  const el = $('#console');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  el.innerHTML = job.log.map((l) => {
    const time = new Date(l.at).toLocaleTimeString([], { hour12: false });
    return `<span class="${/^Failed|failed/.test(l.msg) ? 'err' : ''}"><b>${time}</b>  ${esc(l.msg)}</span>`;
  }).join('\n');
  if (atBottom) el.scrollTop = el.scrollHeight;
}

function renderReceipt(job) {
  const c = job.cost;
  const date = new Date(job.createdAt).toLocaleString();
  if (!c) {
    $('#receipt').innerHTML = `<h3>RECEIPT</h3><p class="r-sub">${esc(date)}</p><p class="r-empty">Costs print here as each paid step finishes.</p>`;
    return;
  }
  const done = job.status === 'done';
  $('#receipt').innerHTML = `
    <h3>RECEIPT</h3>
    <p class="r-sub">${esc(date)} · ${done ? 'final' : 'running total'}</p>
    ${c.items.map((i) => `<div class="r-line"><span>${esc(i.stage)} — ${esc(i.provider)}</span><span>${i.usd ? usd(i.usd) : '$0.000'}</span><small>${esc(i.model ? `${LABELS[i.model] || i.model} · ` : '')}${esc(i.detail)}</small></div>`).join('')}
    <div class="r-total"><span>TOTAL</span><span class="r-big">${usd(c.usd)}</span></div>
    <div class="r-kv">
      <span>In rupees (@${c.usdInr})</span><span>${inr(c.inr)}</span>
      <span>Per clip</span><span>${usd(c.perClipUsd)}</span>
      <span>Per source minute</span><span>${usd(c.perSourceMinuteUsd)}</span>
      <span>Same rate, 20-min video</span><span>${usd(c.per20MinUsd)} · ${inr(c.per20MinUsd * c.usdInr)}</span>
      <span>If hosted (+ CPU time)</span><span>${usd(c.hostedUsd)}</span>
    </div>`;
}

function renderTimeline(job) {
  const el = $('#timeline');
  if (!job.energy?.length || !job.source) { el.innerHTML = ''; state.timelineKey = ''; return; }
  const dur = job.source.duration;
  const key = `${job.id}:${job.clips.map((c) => `${c.id}${c.rank}`).join(',')}`;
  if (key === state.timelineKey) return;
  state.timelineKey = key;
  const scenes = (job.scenes || []).filter((_, i, a) => a.length < 300 || i % Math.ceil(a.length / 300) === 0);
  el.innerHTML = `
    <div class="tl-label"><span>ENERGY MAP · loudness across the full video · ticks = scene cuts</span><span>${job.clips.length ? `${job.clips.length} clips picked` : ''}</span></div>
    <div class="tl-track">
      <div class="tl-bars">${job.energy.map((v) => `<i style="height:${Math.max(2, v * 100)}%"></i>`).join('')}</div>
      ${scenes.map((t) => `<span class="tl-cut" style="left:${(t / dur) * 100}%"></span>`).join('')}
      ${job.clips.map((c) => `<span class="tl-clip" data-clip="${c.id}" title="#${c.rank} ${esc(c.title)}" style="left:${(c.start / dur) * 100}%;width:${Math.max(0.4, (c.duration / dur) * 100)}%"><b>${c.rank}</b></span>`).join('')}
      <div class="tl-axis"><span>0:00</span><span>${fmtTime(dur / 4)}</span><span>${fmtTime(dur / 2)}</span><span>${fmtTime((dur * 3) / 4)}</span><span>${fmtTime(dur)}</span></div>
    </div>`;
  el.querySelectorAll('.tl-clip').forEach((b) => {
    const card = () => state.clipEls.get(b.dataset.clip);
    b.addEventListener('mouseenter', () => card()?.classList.add('hot'));
    b.addEventListener('mouseleave', () => card()?.classList.remove('hot'));
    b.addEventListener('click', () => card()?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
}

function renderClips(job) {
  const wrap = $('#clips');
  const features = state.model?.features || [];
  const ordered = [...job.clips].sort((a, b) => a.rank - b.rank);
  ordered.forEach((clip, i) => {
    let el = state.clipEls.get(clip.id);
    if (!el) {
      el = $('#clipTpl').content.firstElementChild.cloneNode(true);
      el.style.setProperty('--i', i);
      el.dataset.id = clip.id;
      state.clipEls.set(clip.id, el);
      el.addEventListener('mouseenter', () => document.querySelector(`.tl-clip[data-clip="${clip.id}"]`)?.classList.add('hot'));
      el.addEventListener('mouseleave', () => document.querySelector(`.tl-clip[data-clip="${clip.id}"]`)?.classList.remove('hot'));
      el.querySelectorAll('.thumb').forEach((btn) => btn.addEventListener('click', () => rate(job.id, clip.id, Number(btn.dataset.label), el)));
      el.querySelector('.copy').addEventListener('click', async (e) => {
        const c = state.job.clips.find((x) => x.id === clip.id);
        await navigator.clipboard.writeText(`${c.caption}\n\n${c.hashtags.join(' ')}`).catch(() => {});
        e.target.textContent = 'Copied';
        setTimeout(() => { e.target.textContent = 'Copy caption'; }, 1400);
      });
    }
    if (wrap.children[i] !== el) wrap.insertBefore(el, wrap.children[i] || null);
    updateClip(el, clip, job, features);
  });
  for (const [id, el] of state.clipEls) if (!job.clips.some((c) => c.id === id)) { el.remove(); state.clipEls.delete(id); }
}

function updateClip(el, clip, job, features) {
  el.querySelector('.clip-rank').textContent = `#${String(clip.rank).padStart(2, '0')}`;
  const score = el.querySelector('.clip-score');
  score.querySelector('b').textContent = clip.score ?? '–';
  score.querySelector('span').textContent = clip.tier || '';
  score.className = `clip-score ${clip.score >= 70 ? '' : clip.score >= 55 ? 't-solid' : 't-long'}`;
  el.querySelector('.clip-title').textContent = clip.title;
  el.querySelector('.clip-meta').innerHTML = `${fmtTime(clip.start)} → ${fmtTime(clip.end)} · ${clip.duration} s · ${esc(clip.format)} <em>· ${({ fit: 'letterbox', mixed: 'crop + letterbox', crop: 'tracked crop' })[clip.layout] || clip.layout}</em>`;
  el.querySelector('.clip-hook').textContent = clip.hookText;
  el.querySelector('.clip-why').textContent = clip.why;
  el.querySelector('.clip-caption').textContent = clip.caption;
  el.querySelector('.clip-tags').textContent = clip.hashtags.join(' ');

  const bars = el.querySelector('.bars');
  if (clip.features && features.length && !bars.dataset.done) {
    bars.dataset.done = '1';
    bars.innerHTML = features.map((f) => {
      const v = clip.features[f.key] ?? 0;
      const shown = f.source === 'llm' ? Math.round(v * 10) : Math.round(v * 100);
      return `<div class="bar-row ${f.source === 'measured' ? 'measured' : ''}" title="${esc(f.hint)}"><span>${esc(f.label)}</span><b>${shown}</b><span class="track"><i style="width:${v * 100}%"></i></span></div>`;
    }).join('') + '<div class="bars-legend"><span>curator judgement /10</span><span class="m">measured from audio &amp; video /100</span></div>';
  }

  const media = el.querySelector('.clip-media');
  const video = media.querySelector('video');
  let overlay = media.querySelector('.clip-pending');
  if (clip.status === 'done') {
    overlay?.remove();
    const src = `/media/${job.id}/${clip.file}`;
    if (video.dataset.src !== src) {
      video.dataset.src = src;
      video.poster = `/media/${job.id}/${clip.poster}`;
      video.src = src;
    }
    const dl = el.querySelector('.dl');
    dl.href = src;
    dl.download = `${String(clip.rank).padStart(2, '0')}-${slug(clip.title)}.mp4`;
    dl.removeAttribute('aria-disabled');
  } else {
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'clip-pending'; media.append(overlay); }
    overlay.textContent = clip.status === 'error'
      ? `Render failed: ${clip.error}`
      : clip.status === 'rendering' ? `Rendering ${Math.round((clip.progress || 0) * 100)}%` : 'Queued for render';
    el.querySelector('.dl').removeAttribute('href');
  }
  media.querySelector('.clip-progress').hidden = clip.status === 'done';
  media.querySelector('.clip-progress i').style.width = `${Math.round((clip.progress || 0) * 100)}%`;
  el.querySelector('.thumb.up').classList.toggle('on', clip.feedback === 1);
  el.querySelector('.thumb.down').classList.toggle('on', clip.feedback === 0);
}

async function rate(jobId, clipId, label, el) {
  const clip = state.job.clips.find((c) => c.id === clipId);
  const next = clip.feedback === label ? null : label;
  try {
    await postJson(`/api/jobs/${jobId}/clips/${clipId}/feedback`, { label: next });
    clip.feedback = next;
    el.querySelector('.thumb.up').classList.toggle('on', next === 1);
    el.querySelector('.thumb.down').classList.toggle('on', next === 0);
    loadModel();
  } catch (ex) {
    alertInline(ex.message);
  }
}

/* ---------------- training panel ---------------- */
async function loadModel() {
  const m = await api('/api/model').catch(() => null);
  if (!m) return;
  state.model = m;
  const r = m.ratings;
  const canTrain = r.total >= 6 && r.liked >= 2 && r.disliked >= 2;
  const maxW = Math.max(...m.features.map((f) => Math.max(m.weights[f.key], m.defaults[f.key])));
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  $('#training').innerHTML = `
    <p class="kicker">Virality model · ${m.trained ? `trained ${new Date(m.trainedAt).toLocaleDateString()}` : 'default weights'}</p>
    <h2>Train it on your taste</h2>
    <p>Every ▲/▼ you give a clip does two things. The next curation run shows the curator your liked and disliked picks as examples,
      and <b>Train</b> re-fits how much each signal counts toward the virality score, pulled toward the defaults so a few ratings can't flip the model.</p>
    <div class="t-stats">
      <div><b>${r.total}</b><span>ratings</span></div>
      <div><b>${r.liked}</b><span>▲ liked</span></div>
      <div><b>${r.disliked}</b><span>▼ disliked</span></div>
      <div><b>${m.trained ? `${pct(m.aucBefore)}→${pct(m.aucAfter)}` : '—'}</b><span>ranking accuracy</span></div>
    </div>
    <div class="weights">
      ${m.features.map((f) => `
        <div class="w-row" title="${esc(f.hint)}"><span>${esc(f.label)}</span>
          <span class="w-track"><i class="${f.source === 'measured' ? 'm' : ''}" style="width:${(m.weights[f.key] / maxW) * 100}%"></i><s style="left:${(m.defaults[f.key] / maxW) * 100}%" title="default"></s></span>
          <b>${(m.weights[f.key] * 100).toFixed(1)}%</b></div>`).join('')}
    </div>
    <div class="t-actions">
      <button class="btn primary" id="trainBtn" ${canTrain ? '' : 'disabled'}>Train on ${r.total} rating${r.total === 1 ? '' : 's'}</button>
      ${m.trained ? '<button class="btn" id="resetBtn">Reset to defaults</button>' : ''}
      <span class="t-msg" id="trainMsg">${canTrain ? '' : 'Needs 6+ ratings with at least 2 ▲ and 2 ▼.'}</span>
    </div>`;
  $('#trainBtn').onclick = async () => {
    $('#trainMsg').textContent = 'Training…';
    try {
      const res = await postJson('/api/train');
      await loadModel();
      $('#trainMsg').textContent = `Ranking accuracy on your ratings: ${pct(res.aucBefore)} → ${pct(res.aucAfter)}. New runs use these weights.`;
    } catch (ex) { $('#trainMsg').textContent = ex.message; }
  };
  if ($('#resetBtn')) $('#resetBtn').onclick = async () => { await postJson('/api/model/reset'); loadModel(); };
}

/* ---------------- history ---------------- */
async function loadHistory() {
  const jobs = await api('/api/jobs').catch(() => []);
  $('#history').innerHTML = jobs.length
    ? jobs.slice(0, 30).map((j) => `
      <li><a href="#/job/${j.id}" data-id="${j.id}" class="${j.id === state.jobId ? 'sel' : ''}">
        <span class="h-title">${esc(j.title)}</span>
        <span class="h-score">${j.topScore ?? ''}</span>
        <span class="h-meta">${new Date(j.createdAt).toLocaleString()} · ${esc(j.status)}${j.duration ? ` · ${fmtTime(j.duration)}` : ''} · ${j.clipCount} clips${j.costUsd != null ? ` · ${usd(j.costUsd)}` : ''}</span>
      </a></li>`).join('')
    : '<li class="empty">No runs yet. Paste a link above.</li>';
}

/* ---------------- boot ---------------- */
function route() {
  const m = location.hash.match(/^#\/job\/([\w-]+)/);
  if (m) openJob(m[1]);
}

setInterval(() => { if (state.job && state.job.status === 'running') renderStages(state.job); }, 1000);
$('#estMinutes').addEventListener('input', refreshEstimate);
window.addEventListener('hashchange', route);

await loadHealth().catch((e) => { $('#health').innerHTML = `<span class="bad">server unreachable: ${esc(e.message)}</span>`; });
setupIntake();
await loadModel();
refreshEstimate();
loadHistory();
route();
