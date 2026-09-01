import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { type SchemeOverride } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

import { ListGroup, Skeleton, EmptyState, SegmentedControl } from '../../components/primitives';
import { AuthBanner } from '../../components/shared/AuthBanner';
import { SensorGridIcon, ChevronRightIcon } from '../../components/primitives/Icons';

type Node = { id: string; name: string; version: string; battery: string; rssi: string; online: boolean };

const NODES: Node[] = [
  { id: 'node-b', name: 'Node B (MLX90640)', version: 'v2.0-DIAGNOSTIC', battery: '84%', rssi: '-45 dBm', online: true },
  { id: 'node-a', name: 'Node A (INMP441)', version: 'v2.0-DIAGNOSTIC', battery: '42%', rssi: '-52 dBm', online: true },
];

export default function NodesScreen() {
  const { user } = useAuth();
  const { colors, spacing, radius, typography } = useTheme();
  const { schemeOverride, setSchemeOverride } = useTheme();

  const [loading, setLoading] = useState(true);

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

      <Text style={typography.h1}>Hardware Nodes</Text>

      {/* Hardware nodes */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Hardware nodes</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{NODES.length} active</Text>
        </View>
        {loading ? (
          <Skeleton rows={2} />
        ) : NODES.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<SensorGridIcon size={16} color={colors.accent} />}
              title="No hardware connected"
              message="Pair a thermal or acoustic sensor node to start collecting data."
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {NODES.map((node) => (
              <View key={node.id} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ backgroundColor: colors.successContainer, borderRadius: radius.sm, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
                    <SensorGridIcon size={16} color={colors.healthy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.h2, { color: colors.textPrimary }]}>{node.name}</Text>
                    <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 12.5 }]}>
                      {node.version}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colors.healthy,
                      shadowColor: colors.healthy,
                      shadowOpacity: 0.8,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 0 },
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
                  <View>
                    <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>Battery</Text>
                    <Text style={[typography.body, { color: colors.textPrimary, marginTop: 3, fontWeight: '600' }]}>{node.battery}</Text>
                  </View>
                  <View>
                    <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>Signal</Text>
                    <Text style={[typography.body, { color: colors.textPrimary, marginTop: 3, fontWeight: '600' }]}>{node.rssi}</Text>
                  </View>
                  <View>
                    <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>Status</Text>
                    <Text style={[typography.body, { color: colors.healthy, marginTop: 3, fontWeight: '600' }]}>
                      {node.online ? 'Active' : 'Offline'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ListGroup>
        )}
      </View>

      {/* Appearance */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Appearance</Text>
        <SegmentedControl
          options={[
            { key: 'system', label: 'System' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ]}
          value={schemeOverride}
          onChange={(key) => {
            playSound('tap');
            haptic('light');
            setSchemeOverride(key as SchemeOverride);
          }}
        />
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
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>Pigpulse · v2.1.0</Text>
      </View>
    </ScrollView>
  );
}