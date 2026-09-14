// Captik's dashboard sidebar (components/editor/DashboardSidebar.tsx) for the clipper: same collapsible rail,
// logo row, nav pills and footer card. Where Captik shows plan usage, the clipper shows the local engine.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, Clapperboard, Film, HelpCircle, Home, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import Tooltip from '@/components/ui/Tooltip';
import { readPref, writePref } from '../format.js';

const NAV = [
  { id: 'home', href: '#/', icon: Home, label: 'Home' },
  { id: 'cost', href: '#/cost', icon: Calculator, label: 'Cost per video' },
  { id: 'train', href: '#/train', icon: Sparkles, label: 'Train the curator' },
];
const LINKS = [
  { href: 'https://captik.in/templates', icon: Film, label: 'Templates' },
  { href: 'https://captik.in/editor', icon: Clapperboard, label: 'Open Captik' },
];

function CollapsedTip({ collapsed, label, children }) {
  return collapsed ? <Tooltip label={label} side="right" className="w-full">{children}</Tooltip> : children;
}

function EngineCard({ health, error }) {
  const rows = health
    ? [
      ['ffmpeg', Boolean(health.ffmpeg), health.ffmpeg ? health.ffmpeg.split('-')[0] : 'missing'],
      ['yt-dlp', Boolean(health.ytdlp), health.ytdlp || 'missing'],
      ['Claude', health.anthropicKey, health.anthropicKey ? 'key set' : 'no key'],
      ['Sarvam', health.sarvamKey, health.sarvamKey ? 'key set' : 'no key'],
      ['Word timing', health.wordTiming, health.wordTiming ? 'ElevenLabs' : 'not set'],
    ]
    : [];
  return (
    <div className="mx-2 mb-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Local engine</p>
      {error && <p className="mt-2 text-[11px] text-red-400">The clipper server is unreachable.</p>}
      <ul className="mt-2 space-y-1">
        {rows.map(([name, ok, value]) => (
          <li key={name} className="flex items-center gap-2 text-[11px]">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-zinc-400">{name}</span>
            <span className="ml-auto max-w-[88px] truncate font-mono text-[10px] text-zinc-600">{value}</span>
          </li>
        ))}
      </ul>
      {health && <p className="mt-2 border-t border-white/[0.05] pt-2 text-[10px] text-zinc-600">Up to {health.maxClips} clips per video</p>}
    </div>
  );
}

export default function Sidebar({ active, health, healthError }) {
  const [collapsed, setCollapsed] = useState(() => readPref('clipper.sidebarCollapsed', false));
  const toggle = (value) => { setCollapsed(value); writePref('clipper.sidebarCollapsed', value); };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 220 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-[#09090d]"
    >
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} shrink-0 px-3 pb-3 pt-4`}>
        {!collapsed ? (
          <a href="#/" className="group flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-[13px] font-bold tracking-tight text-white">Captik</span>
            <span className="rounded border border-amber-400/20 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300">Clipper</span>
          </a>
        ) : (
          <LogoMark size={24} />
        )}
        {!collapsed && (
          <button type="button" onClick={() => toggle(true)} aria-label="Collapse sidebar" className="cursor-pointer rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-white/[0.05] hover:text-zinc-300">
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Navigation">
        {NAV.map(({ id, href, icon: Icon, label }) => {
          const on = active === id;
          return (
            <CollapsedTip key={id} collapsed={collapsed} label={label}>
              <a
                href={href}
                aria-label={label}
                aria-current={on ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-150 ${on ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200'}`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={on ? 2 : 1.75} />
                {!collapsed && <span className="text-[12px] font-medium">{label}</span>}
              </a>
            </CollapsedTip>
          );
        })}

        {!collapsed && <div className="my-2 border-t border-white/[0.06]" />}

        {LINKS.map(({ href, icon: Icon, label }) => (
          <CollapsedTip key={href} collapsed={collapsed} label={label}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-zinc-600 transition-all duration-150 hover:bg-white/[0.04] hover:text-zinc-200">
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span className="text-[12px] font-medium">{label}</span>}
            </a>
          </CollapsedTip>
        ))}
      </nav>

      {!collapsed && <EngineCard health={health} error={healthError} />}

      {collapsed && (
        <button type="button" onClick={() => toggle(false)} aria-label="Expand sidebar" className="mx-auto mb-2 cursor-pointer rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-white/[0.05] hover:text-zinc-300">
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      )}

      {!collapsed && (
        <div className="border-t border-white/[0.06] px-2 pb-3 pt-2">
          <a
            href="https://github.com/nipun26236/captik-clipper#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] text-zinc-700 transition-all hover:bg-white/[0.03] hover:text-zinc-400"
          >
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            Help & Docs
          </a>
        </div>
      )}
    </motion.aside>
  );
}
