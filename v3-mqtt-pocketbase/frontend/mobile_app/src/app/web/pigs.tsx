import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

import { ListGroup } from '../../components/primitives';
import { ChevronRightIcon } from '../../components/primitives/Icons';

export default function PigsScreen() {
  useAuth();
  const { colors, spacing, typography } = useTheme();
  const [, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1050);
    return () => clearTimeout(t);
  }, []);

  const pigs = [
    { id: 'pig-001', name: 'Babe', status: 'healthy', temperature: 38.5, lastSeen: '2 min ago' },
    { id: 'pig-002', name: 'Wilbur', status: 'watch', temperature: 39.2, lastSeen: '5 min ago' },
    { id: 'pig-003', name: 'Porky', status: 'healthy', temperature: 38.8, lastSeen: '1 min ago' },
    { id: 'pig-004', name: 'Hamlet', status: 'fever', temperature: 39.9, lastSeen: '10 min ago' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return colors.healthy;
      case 'watch': return colors.watch;
      case 'fever': return colors.alert;
      default: return colors.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'watch': return 'Watch';
      case 'fever': return 'Fever';
      default: return 'Unknown';
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 60 }}>
      <Text style={typography.h1}>Pig Roster</Text>

      {/* Stats */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.lg }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[typography.h2, { color: colors.healthy }]}>{pigs.filter(p => p.status === 'healthy').length}</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>Healthy</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[typography.h2, { color: colors.watch }]}>{pigs.filter(p => p.status === 'watch').length}</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>Watch</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[typography.h2, { color: colors.alert }]}>{pigs.filter(p => p.status === 'fever').length}</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>Fever</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[typography.h2, { color: colors.textPrimary }]}>{pigs.length}</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>Total</Text>
        </View>
      </View>

      {/* Pig List */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Individual pigs</Text>
        <ListGroup>
          {pigs.map((pig) => (
            <TouchableOpacity
              key={pig.id}
              style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, minHeight: 44 }}
              activeOpacity={0.7}
              onPress={() => {
                playSound('tap');
                haptic('light');
                // Navigate to pig details
              }}
              accessibilityLabel={`View details for ${pig.name}`}
              accessibilityHint={`Tap to see detailed information about ${pig.name}`}
              accessibilityRole="button"
            >
              <View style={{ 
                backgroundColor: colors.successContainer, 
                borderRadius: 22, 
                width: 44, 
                height: 44, 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginRight: spacing.md 
              }}>
                <Text style={{ fontSize: 20 }}>🐷</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 15 }]}>{pig.name}</Text>
                <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>
                  {pig.lastSeen} • {pig.temperature}°C
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.bodySmall, { color: getStatusColor(pig.status), fontWeight: '600' }]}>
                  {getStatusLabel(pig.status)}
                </Text>
                <ChevronRightIcon size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </ListGroup>
      </View>

      {/* Add Pig Button */}
      <View style={{ marginTop: spacing.xl }}>
        <TouchableOpacity
          style={{
            backgroundColor: colors.accent,
            borderRadius: 12,
            padding: spacing.md,
            alignItems: 'center',
            minHeight: 44,
          }}
          activeOpacity={0.7}
          onPress={() => {
            playSound('tap');
            haptic('light');
            // Navigate to add pig screen
          }}
          accessibilityLabel="Add new pig"
          accessibilityHint="Opens form to add a new pig to the roster"
          accessibilityRole="button"
        >
          <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 15 }]}>+ Add Pig</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}