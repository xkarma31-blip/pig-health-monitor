/**
 * Theme Switcher Component
 * Designed for farmers and veterinarians with accessibility improvements
 * Includes Google Stich integration for theme consistency
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme, useGoogleStich, useAccessibility } from '../../theme/ThemeContext';
import { FARMER_THEME, VETERINARIAN_THEME, NIGHT_THEME } from '../../theme/ThemeContext';

interface ThemeSwitcherProps {
  visible?: boolean;
  onClose?: () => void;
}

export function ThemeSwitcher({ visible = true, onClose }: ThemeSwitcherProps) {
  const { theme, themeMode, setThemeMode, toggleTheme, toggleHighContrast, isHighContrast } = useTheme();
  const { syncWithGoogleStich, exportThemeForStich } = useGoogleStich();
  const { ensureMinimumContrast, getContrastRatio } = useAccessibility();
  
  const [selectedPreset, setSelectedPreset] = useState<'farmer' | 'veterinarian' | 'night' | 'custom'>('custom');

  // Available theme presets
  // NOTE: Hardcoded hex values below are intentional — these objects define theme
  // preset data (FARMER_THEME, VETERINARIAN_THEME, NIGHT_THEME) and Google Stich
  // theme references. They are consumed by preset selection logic, not rendered
  // directly as UI colors, so they remain as definition data.
  const themePresets = [
    {
      id: 'farmer',
      name: 'Farmer Theme',
      description: 'Optimized for outdoor farming environments',
      theme: FARMER_THEME,
      icon: '🌾',
      colors: {
        primary: '#2E7D32',
        secondary: '#1976D2',
        background: '#FFFFFF',
        surface: '#FAFAFA',
      }
    },
    {
      id: 'veterinarian',
      name: 'Veterinarian Theme',
      description: 'Professional medical interface',
      theme: VETERINARIAN_THEME,
      icon: '🏥',
      colors: {
        primary: '#1565C0',
        secondary: '#7B1FA2',
        background: '#FFFFFF',
        surface: '#FAFAFA',
      }
    },
    {
      id: 'night',
      name: 'Night Theme',
      description: 'Low-light environment optimized',
      theme: NIGHT_THEME,
      icon: '🌙',
      colors: {
        primary: '#66BB6A',
        secondary: '#64B5F6',
        background: '#0D1117',
        surface: '#161B22',
      }
    }
  ];

  // Google Stich themes
  const googleStichThemes = [
    {
      id: 'google-light',
      name: 'Google Light',
      description: 'Google Material Design Light',
      colors: {
        primary: '#1976D2',
        secondary: '#7B1FA2',
        background: '#FFFFFF',
        surface: '#FFFFFF',
      }
    },
    {
      id: 'google-dark',
      name: 'Google Dark',
      description: 'Google Material Design Dark',
      colors: {
        primary: '#90CAF9',
        secondary: '#CE93D8',
        background: '#121212',
        surface: '#1E1E1E',
      }
    }
  ];

  const handlePresetSelect = (presetId: 'farmer' | 'veterinarian' | 'night') => {
    setSelectedPreset(presetId);
    // Apply the preset theme
    const preset = themePresets.find(p => p.id === presetId);
    if (preset) {
      // In a real implementation, you would apply the preset theme
      console.log('Applied preset:', preset.name);
    }
  };

  const handleGoogleStichSync = (stichTheme: 'google-light' | 'google-dark') => {
    const stich = googleStichThemes.find(t => t.id === stichTheme);
    if (stich) {
      syncWithGoogleStich(stichTheme === 'google-light' ? 'light' : 'dark');
      console.log('Synced with Google Stich:', stich.name);
    }
  };

  const exportCurrentTheme = () => {
    const exported = exportThemeForStich();
    console.log('Exported theme:', exported);
    // In a real implementation, you would save this to a file or cloud
  };

  const checkAccessibility = () => {
    const hasGoodContrast = ensureMinimumContrast(theme.colors.textPrimary, theme.colors.background);
    const contrastRatio = getContrastRatio(theme.colors.textPrimary, theme.colors.background);
    
    return {
      hasGoodContrast,
      contrastRatio: contrastRatio.toFixed(2),
      meetsWCAG: contrastRatio >= 4.5,
    };
  };

  const accessibility = checkAccessibility();

  if (!visible) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          Theme Settings
        </Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close theme settings"
          accessibilityHint="Closes the theme settings panel"
        >
          <Text style={[styles.closeButton, { color: theme.colors.textSecondary }]}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      {/* Theme Mode Selection */}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Theme Mode
        </Text>
        
        <View style={styles.modeButtons}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                backgroundColor: themeMode === 'light' ? theme.colors.primary : theme.colors.surfaceVariant,
                borderColor: theme.colors.border,
              }
            ]}
            onPress={() => setThemeMode('light')}
            accessibilityRole="button"
            accessibilityLabel="Light mode"
            accessibilityHint="Switches to light theme"
          >
            <Text style={[
              styles.modeButtonText,
              { color: themeMode === 'light' ? theme.colors.white : theme.colors.textPrimary }
            ]}>
              ☀️ Light
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                backgroundColor: themeMode === 'dark' ? theme.colors.primary : theme.colors.surfaceVariant,
                borderColor: theme.colors.border,
              }
            ]}
            onPress={() => setThemeMode('dark')}
            accessibilityRole="button"
            accessibilityLabel="Dark mode"
            accessibilityHint="Switches to dark theme"
          >
            <Text style={[
              styles.modeButtonText,
              { color: themeMode === 'dark' ? theme.colors.white : theme.colors.textPrimary }
            ]}>
              🌙 Dark
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                backgroundColor: themeMode === 'auto' ? theme.colors.primary : theme.colors.surfaceVariant,
                borderColor: theme.colors.border,
              }
            ]}
            onPress={() => setThemeMode('auto')}
            accessibilityRole="button"
            accessibilityLabel="Auto mode"
            accessibilityHint="Follows system theme setting"
          >
            <Text style={[
              styles.modeButtonText,
              { color: themeMode === 'auto' ? theme.colors.white : theme.colors.textPrimary }
            ]}>
              🔄 Auto
            </Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          style={[
            styles.toggleButton,
            { backgroundColor: theme.colors.secondary }
          ]}
          onPress={toggleTheme}
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          accessibilityHint="Switches between light and dark theme"
        >
          <Text style={[styles.toggleButtonText, { color: theme.colors.white }]}>
            🔄 Toggle Theme
          </Text>
        </TouchableOpacity>
      </View>

      {/* High Contrast Mode */}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Accessibility
        </Text>
        
        <View style={styles.toggleContainer}>
          <Text style={[styles.toggleLabel, { color: theme.colors.textPrimary }]}>
            High Contrast Mode
          </Text>
          <TouchableOpacity
            style={[
              styles.toggleSwitch,
              {
                backgroundColor: isHighContrast ? theme.colors.success : theme.colors.surfaceVariant,
                borderColor: theme.colors.border,
              }
            ]}
            onPress={toggleHighContrast}
            accessibilityRole="button"
            accessibilityLabel="High contrast mode"
            accessibilityHint={isHighContrast ? 'Currently enabled. Tap to disable.' : 'Currently disabled. Tap to enable.'}
          >
            <View style={[
              styles.toggleKnob,
              {
                transform: [{ translateX: isHighContrast ? 24 : 0 }],
                backgroundColor: isHighContrast ? theme.colors.white : theme.colors.textPrimary,
              }
            ]} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.accessibilityInfo}>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
            Contrast Ratio: {accessibility.contrastRatio}:1
          </Text>
          <Text style={[
            styles.infoText,
            { 
              color: accessibility.meetsWCAG ? theme.colors.success : theme.colors.error 
            }
          ]}>
            WCAG AA: {accessibility.meetsWCAG ? '✓' : '✗'}
          </Text>
        </View>
      </View>

      {/* Theme Presets */}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Preset Themes
        </Text>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {themePresets.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.presetCard,
                {
                  backgroundColor: selectedPreset === preset.id ? theme.colors.primary : theme.colors.surfaceVariant,
                  borderColor: theme.colors.border,
                }
              ]}
              onPress={() => handlePresetSelect(preset.id as 'farmer' | 'veterinarian' | 'night')}
              accessibilityRole="button"
              accessibilityLabel={preset.name}
              accessibilityHint={`Selects ${preset.name} theme preset`}
            >
              <View style={[styles.presetIcon, { backgroundColor: theme.colors.shadow }]}>
                <Text style={styles.presetIconText}>
                  {preset.icon}
                </Text>
              </View>
              <Text style={[
                styles.presetName,
                { color: selectedPreset === preset.id ? theme.colors.white : theme.colors.textPrimary }
              ]}>
                {preset.name}
              </Text>
              <Text style={[
                styles.presetDescription,
                // Kept: translucent white for selected preset text on primary background.
                // No theme token exists for this specific opacity variant.
                { color: selectedPreset === preset.id ? 'rgba(255,255,255,0.8)' : theme.colors.textSecondary }
              ]}>
                {preset.description}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Google Stich Integration */}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Google Stich Integration
        </Text>
        
        <View style={styles.googleStichContainer}>
          {googleStichThemes.map((stich) => (
            <TouchableOpacity
              key={stich.id}
              style={[
                styles.stichButton,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  borderColor: theme.colors.border,
                }
              ]}
              onPress={() => handleGoogleStichSync(stich.id as 'google-light' | 'google-dark')}
              accessibilityRole="button"
              accessibilityLabel={stich.name}
              accessibilityHint={`Syncs with Google Stich ${stich.name} theme`}
            >
              <Text style={[styles.stichName, { color: theme.colors.textPrimary }]}>
                {stich.name}
              </Text>
              <Text style={[styles.stichDescription, { color: theme.colors.textSecondary }]}>
                {stich.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <TouchableOpacity
          style={[
            styles.exportButton,
            { backgroundColor: theme.colors.primary }
          ]}
          onPress={exportCurrentTheme}
          accessibilityRole="button"
          accessibilityLabel="Export theme"
          accessibilityHint="Exports current theme configuration"
        >
          <Text style={[styles.exportButtonText, { color: theme.colors.white }]}>
            📤 Export Theme
          </Text>
        </TouchableOpacity>
      </View>

      {/* Current Theme Info */}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Current Theme
        </Text>
        
        <View style={styles.themeInfo}>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
            Mode: {theme.mode}
          </Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
            Contrast: {theme.contrast}
          </Text>
          <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
            High Contrast: {isHighContrast ? '✓' : '✗'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  closeButton: {
    fontSize: 24,
    fontWeight: '600',
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  toggleSwitch: {
    width: 48,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  accessibilityInfo: {
    flexDirection: 'row',
    gap: 16,
  },
  infoText: {
    fontSize: 14,
  },
  presetCard: {
    width: 140,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginRight: 12,
  },
  presetIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  presetIconText: {
    fontSize: 24,
  },
  presetName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  presetDescription: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 14,
  },
  googleStichContainer: {
    gap: 8,
    marginBottom: 12,
  },
  stichButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  stichName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stichDescription: {
    fontSize: 14,
    opacity: 0.8,
  },
  exportButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  themeInfo: {
    gap: 8,
  },
});