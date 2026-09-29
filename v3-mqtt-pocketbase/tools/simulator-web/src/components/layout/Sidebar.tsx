/**
 * Sidebar — Main navigation rail for the simulator.
 *
 * Dark theme (#090d16 bg, #06b6d4 accent).  Collapsible on mobile
 * via a hamburger toggle.  Uses lucide-react icons for each route
 * and highlights the active page via react-router-dom's NavLink.
 */
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  AudioWaveform,
  Thermometer,
  Layers,
  Settings,
  Menu,
  X,
  Activity,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/audio', label: 'Audio Lab', icon: AudioWaveform },
  { to: '/thermal', label: 'Thermal Lab', icon: Thermometer },
  { to: '/fusion', label: 'Fusion Lab', icon: Layers },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Collapsible sidebar with route links and PigPulse branding. */
export function Sidebar() {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-cyan-500/15 text-cyan-400'
        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
    }`;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-[#111827] text-cyan-400 lg:hidden"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-56 flex flex-col
          bg-[#090d16] border-r border-gray-800
          transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo / brand */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-800">
          <Activity className="text-cyan-400" size={22} />
          <span className="text-lg font-bold text-white tracking-wide">
            PigPulse
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1 px-3 py-4" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 text-xs text-gray-600 border-t border-gray-800">
          Simulator v3
        </div>
      </aside>
    </>
  );
}
