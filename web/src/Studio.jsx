// Clip studio shell: loads the job, follows it over the event stream, and opens one clip at a time in the
// Captik editor. The editor remounts when a trim lands, so it starts from the re-timed captions.
import { useCallback, useEffect, useState } from 'react';
import ClipEditor from './ClipEditor.jsx';
import { isEditable } from './ClipRail.jsx';
import { api } from './format.js';

const params = new URLSearchParams(location.search);
const JOB_ID = params.get('job');

function Splash({ children }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0B0B0D] px-6 text-center text-sm text-white/60">
      {children}
    </div>
  );
}

export default function Studio() {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [clipId, setClipId] = useState(params.get('clip'));

  useEffect(() => {
    if (!JOB_ID) {
      setError('Open a clip from the Clipper dashboard.');
      return undefined;
    }
    let es = null;
    let closed = false;
    api(`/api/jobs/${JOB_ID}`)
      .then((j) => {
        if (closed) return;
        setJob(j);
        es = new EventSource(`/api/jobs/${JOB_ID}/events`);
        es.onmessage = (e) => setJob(JSON.parse(e.data));
      })
      .catch((err) => setError(err.message));
    return () => {
      closed = true;
      es?.close();
    };
  }, []);

  const selectClip = useCallback((id) => {
    setClipId(id);
    const url = new URL(location.href);
    url.searchParams.set('clip', id);
    history.replaceState(null, '', url);
  }, []);

  const clips = job?.clips || [];
  const clip = clips.find((c) => c.id === clipId && isEditable(c)) || clips.find(isEditable);
  useEffect(() => {
    if (clip && clip.id !== clipId) selectClip(clip.id);
  }, [clip, clipId, selectClip]);

  if (error) return <Splash>{error}</Splash>;
  if (!job) return <Splash>Loading clips…</Splash>;
  if (!clip) return <Splash>No clip in this job is ready to edit yet.</Splash>;
  return <ClipEditor key={`${clip.id}:${clip.trim?.trimmedAt || ''}`} job={job} clip={clip} onSelectClip={selectClip} />;
}
