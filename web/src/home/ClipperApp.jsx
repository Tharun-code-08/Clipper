// The clipper home, laid out like Captik's signed-in home: Captik's sidebar next to Captik's dashboard page.
import { useState } from 'react';
import Sidebar from './Sidebar.jsx';
import HomePage from './HomePage.jsx';
import JobPage from './JobPage.jsx';
import CostPage from './CostPage.jsx';
import TrainPage from './TrainPage.jsx';
import PrepareClipsModal from './PrepareClipsModal.jsx';
import { useHashRoute, useHealth } from './lib.js';

export default function ClipperApp() {
  const route = useHashRoute();
  const { health, error } = useHealth();
  const [prepare, setPrepare] = useState(null);
  const active = route.name === 'job' ? 'home' : route.name;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0B0D]">
      <Sidebar active={active} health={health} healthError={error} />
      {route.name === 'job' ? (
        <JobPage key={route.id} id={route.id} health={health} />
      ) : route.name === 'cost' ? (
        <CostPage health={health} />
      ) : route.name === 'train' ? (
        <TrainPage />
      ) : (
        <HomePage health={health} onPrepare={setPrepare} />
      )}
      {prepare && (
        <PrepareClipsModal
          source={prepare}
          health={health}
          onClose={() => setPrepare(null)}
          onStarted={(id) => { setPrepare(null); location.hash = `#/job/${id}`; }}
        />
      )}
    </div>
  );
}
