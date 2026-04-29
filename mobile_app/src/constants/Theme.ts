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
    text: '#FFFFFF',             // Primary text (Pure white for max contrast)
    textSecondary: '#A0A0C0',    // Muted text (Lighter than before)
    textMuted: '#8080A0',        // Subtlest text (Now readable)

    // === Brand / Accent ===
    primary: '#00FFE0',          // Electric Aqua (Brighter for better visibility)
    primaryDim: '#00D4AA',       // Previous primary is now the dim version
    secondary: '#5599FF',        // Lighter blue

    // === Status Colors ===
    success: '#00FFE0',          
    warning: '#FFC040',          
    danger: '#FF6060',           
    info: '#5599FF',             

    // === Misc ===
    tabBar: '#12121F',           
    tabActive: '#00FFE0',        
    tabInactive: '#8080A0',      
  },

  typography: {
    h1: 32,         // Page titles (Constitutional Requirement)
    h2: 24,         // Section headers (Constitutional Requirement)
    h3: 20,         // Card headers
    body: 16,       // Normal text (Constitutional Requirement)
    caption: 14,    // Small detail text (Increased from 13)
    huge: 42,       // Big sensor values (Increased for clarity)
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
