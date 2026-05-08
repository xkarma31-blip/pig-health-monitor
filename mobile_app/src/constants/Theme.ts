/**
 * 🎨 Pig Health Monitor — Design System
 * 
 * This is the SINGLE SOURCE OF TRUTH for all colors, sizes, and spacing.
 * To restyle the entire app, just change values here.
 */

export const Theme = {
  colors: {
    background: '#0D0D1A',       
    surface: '#1A1A2E',          
    card: '#1E1E34',             
    cardBorder: '#2A2A45',       
    text: '#FFFFFF',             
    textSecondary: '#A0A0C0',    
    textMuted: '#8080A0',        
    primary: '#00FFE0',          
    primaryDim: '#00D4AA',       
    secondary: '#5599FF',        
    success: '#00FFE0',          
    warning: '#FFC040',          
    danger: '#FF6060',           
    info: '#5599FF',             
    tabBar: '#12121F',           
    tabActive: '#00FFE0',        
    tabInactive: '#8080A0',
    accent: '#00FFE0',            // Alias for primary — used by Advisor
  },

  typography: {
    h1: 32,         
    h2: 24,         
    h3: 20,         
    body: 16,       
    caption: 14,    
    huge: 42,       
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
    pill: 999,
  },
};

export const DesktopTheme = {
  typography: {
    h1: 24,         
    h2: 20,         
    h3: 16,         
    body: 14,       
    caption: 12,    
    huge: 30,       
  },
  spacing: {
    xs: 4,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    xxl: 24,
  }
};

/**
 * Helper: Get responsive theme values
 */
export function getResponsiveTheme(isDesktop: boolean) {
  if (!isDesktop) return Theme;
  return {
    ...Theme,
    typography: { ...Theme.typography, ...DesktopTheme.typography },
    spacing: { ...Theme.spacing, ...DesktopTheme.spacing },
  };
}

export function getStatusColor(status: 'normal' | 'warning' | 'danger' | string): string {
  const map: Record<string, string> = {
    normal: Theme.colors.success,
    warning: Theme.colors.warning,
    danger: Theme.colors.danger,
  };
  return map[status] || Theme.colors.text;
}
