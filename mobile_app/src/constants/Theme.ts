/**
 * 🎨 Pig Health Monitor — Design System
 * 
 * This is the SINGLE SOURCE OF TRUTH for all colors, sizes, and spacing.
 * To restyle the entire app, just change values here.
 * 
 * EXAMPLE: Want to change the background color? 
 *   Change `background` below, and EVERY screen updates automatically.
 */

export const Theme = {
  colors: {
    // === Core Palette (Kharl Standard / Aqua Protocol) ===
    background: '#0D0D1A',       // Obsidian Deep Void (High Contrast)
    surface: '#16162B',          // Elevated surfaces
    card: '#1A1A33',             // Glowing card fill
    cardBorder: '#00D4AA44',     // Subtle Aqua borders

    // === Text ===
    text: '#FFFFFF',             // Maximum contrast white
    textSecondary: '#E0E0EB',    // Brightened secondary for low-vision
    textMuted: '#A3A3C2',        // Subtle but readable

    // === Brand / Accent ===
    primary: '#00D4AA',          // Aqua Protocol Cyan/Green
    primaryDim: '#00997A',       // Dimmer Aqua
    secondary: '#FF2A7A',        // Neon Pink Accent

    // === Status Colors ===
    success: '#00D4AA',          // Aqua (Primary)
    warning: '#FFD700',          // Bright Gold
    danger: '#FF3366',           // Intense Red/Pink
    info: '#00D4AA',             // Aqua

    // === Misc ===
    tabBar: '#0D0D1A',           // Obsidian for nav
    tabActive: '#00D4AA',        // Glowing active Aqua icon
    tabInactive: '#5C5C8A',      // Dimmed but visible inactive
  },

  typography: {
    h1: 34,         // Accessibility: Enlarged for Master
    h2: 28,         
    h3: 22,         
    body: 16,       // Accessibility: Minimum 16px body
    caption: 14,    // Accessibility: Increased
    huge: 48,       // For massive metric values
  },

  spacing: {
    xs: 8,
    sm: 12,
    md: 20,
    lg: 28,
    xl: 40,
    xxl: 60,
  },

  borderRadius: {
    sm: 10,
    md: 16,
    lg: 24,
    pill: 999,
  },
};

/**
 * Helper: Get status color from theme
 * Usage: getStatusColor('warning') → '#FFB020'
 */
export function getStatusColor(status: 'normal' | 'warning' | 'danger'): string {
  const map = {
    normal: Theme.colors.success,
    warning: Theme.colors.warning,
    danger: Theme.colors.danger,
  };
  return map[status] || Theme.colors.text;
}
