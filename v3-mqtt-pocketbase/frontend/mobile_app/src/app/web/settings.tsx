import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

import { ListGroup, SegmentedControl } from '../../components/primitives';
import { AuthBanner } from '../../components/shared/AuthBanner';
import { ChevronRightIcon } from '../../components/primitives/Icons';

export default function SettingsScreen() {
  const { user } = useAuth();
  const { colors, spacing, typography } = useTheme();
  const [, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1050);
    return () => clearTimeout(t);
  }, []);

  const openLogin = () => {
    playSound('tap');
    haptic('light');
    // Web navigation would go here
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 60 }}>
      {!user && (
        <AuthBanner
          title="Not authenticated"
          message="Log in to sync live data"
          buttonLabel="LOG IN"
          onPress={openLogin}
        />
      )}

      <Text style={typography.h1}>Settings</Text>

      {/* Appearance */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Appearance</Text>
        <SegmentedControl
          options={[
            { key: 'system', label: 'System' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ]}
          value="system"
          onChange={(_key) => {
            playSound('tap');
            haptic('light');
            // Theme change logic would go here
          }}
        />
      </View>

      {/* Notifications */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Notifications</Text>
        <ListGroup>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, minHeight: 44 }}
            activeOpacity={0.7}
            onPress={() => {
              playSound('tap');
              haptic('light');
            }}
            accessibilityLabel="Alert preferences"
            accessibilityHint="Configure alert notifications"
            accessibilityRole="button"
          >
            <Text style={[typography.h2, { color: colors.textPrimary, flex: 1, fontSize: 15 }]}>Alert preferences</Text>
            <ChevronRightIcon size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </ListGroup>
      </View>

      {/* Account */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Account</Text>
        <ListGroup>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, minHeight: 44 }}
            activeOpacity={0.7}
            onPress={openLogin}
            accessibilityLabel="Log in"
            accessibilityHint="Navigates to login screen"
            accessibilityRole="button"
          >
            <Text style={[typography.h2, { color: colors.textPrimary, flex: 1, fontSize: 15 }]}>Log in</Text>
            <ChevronRightIcon size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </ListGroup>
      </View>

      {/* About */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>About</Text>
        <ListGroup>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, minHeight: 44 }}
            activeOpacity={0.7}
            onPress={() => {
              playSound('tap');
              haptic('light');
            }}
            accessibilityLabel="Version info"
            accessibilityHint="App version and build information"
            accessibilityRole="button"
          >
            <Text style={[typography.h2, { color: colors.textPrimary, flex: 1, fontSize: 15 }]}>Version</Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>v2.1.0</Text>
            <ChevronRightIcon size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </ListGroup>
      </View>
    </ScrollView>
  );
}