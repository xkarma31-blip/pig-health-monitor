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
    // === Core Palette ===
    background: '#0D0D1A',       // Deep navy (main background)
    surface: '#1A1A2E',          // Slightly lighter (card backgrounds)
    card: '#1E1E34',             // Card/panel fill
    cardBorder: '#2A2A45',       // Subtle card borders

    // === Text ===
    text: '#F0F0F0',             // Primary text (white-ish)
    textSecondary: '#8A8AA0',    // Muted/detail text
    textMuted: '#5A5A70',        // Very subtle text

    // === Brand / Accent ===
    primary: '#00D4AA',          // Aqua green (main accent)
    primaryDim: '#00A080',       // Dimmer aqua for pressed states
    secondary: '#3A86FF',        // Blue accent

    // === Status Colors ===
    success: '#00D4AA',          // Green/Aqua — healthy
    warning: '#FFB020',          // Amber — elevated/watch
    danger: '#FF4D4D',           // Red — critical alert
    info: '#3A86FF',             // Blue — informational

    // === Misc ===
    tabBar: '#12121F',           // Bottom tab background
    tabActive: '#00D4AA',        // Active tab icon
    tabInactive: '#5A5A70',      // Inactive tab icon
  },

  typography: {
    h1: 28,         // Page titles
    h2: 22,         // Section headers
    h3: 18,         // Card headers
    body: 16,       // Normal text
    caption: 13,    // Small detail text
    huge: 36,       // Big sensor values
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    pill: 999,    // For badges/pills
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
