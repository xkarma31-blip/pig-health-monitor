export interface TopNavProps {
  accessible?: boolean;
  onToggleAccessible?: (next: boolean) => void;
  className?: string;
}

/**
 * Top navigation with an ALWAYS-visible accessibility toggle (aria-pressed).
 * Controlled via props so the App can propagate accessible mode to every
 * panel — previously the toggle only rendered while already enabled, so
 * accessible mode could never be turned on from the default state.
 */
export function TopNav({
  accessible = false,
  onToggleAccessible,
  className = ''
}: TopNavProps) {
  return (
    <nav
      role="navigation"
      data-testid="top-nav"
      className={`top-nav ${accessible ? 'accessible' : ''} ${className}`}
    >
      <div className="top-nav-left">
        <span>PigPulse Simulation</span>
      </div>
      <div className="top-nav-right">
        <button
          data-testid="accessible-toggle"
          aria-pressed={accessible}
          aria-label={`Accessible mode ${accessible ? 'on' : 'off'}`}
          onClick={() => onToggleAccessible?.(!accessible)}
          style={{ marginLeft: '1rem' }}
        >
          Accessible mode: {accessible ? 'on' : 'off'}
        </button>
      </div>
    </nav>
  );
}