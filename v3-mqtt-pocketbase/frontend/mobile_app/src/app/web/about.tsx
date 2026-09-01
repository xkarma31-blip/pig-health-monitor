import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../hooks/useAuth';

export default function AboutScreen() {
  useAuth();
  const { colors, spacing, typography } = useTheme();

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 60 }}>
      <Text style={typography.h1}>About Pig Health Monitor</Text>

      {/* App Info */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
          Pig Health Monitor is a comprehensive livestock monitoring system designed to track the health and wellbeing of pigs using advanced sensor technology and machine learning.
        </Text>
      </View>

      {/* Version */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Version</Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>v2.1.0</Text>
      </View>

      {/* Features */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Features</Text>
        <View style={{ gap: spacing.sm }}>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Real-time temperature monitoring using MLX90640 thermal sensors</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Audio-based cough detection with Edge Impulse ML</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Firebase-powered data synchronization</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Cross-platform support (iOS, Android, Web)</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Health status tracking and alerting</Text>
        </View>
      </View>

      {/* Technology Stack */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Built with</Text>
        <View style={{ gap: spacing.sm }}>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• React Native & Expo</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Firebase Realtime Database</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• TensorFlow.js for ML inference</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Edge Impulse for model training</Text>
          <Text style={[typography.body, { color: colors.textPrimary }]}>• Expo Router for navigation</Text>
        </View>
      </View>

      {/* Contact */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Contact</Text>
        <Text style={[typography.body, { color: colors.textPrimary }]}>Email: support@pighealthmonitor.com</Text>
        <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.sm }]}>Website: https://pig-health-monitor.vercel.app</Text>
      </View>

      {/* License */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>License</Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          This software is licensed under the MIT License. See LICENSE file for details.
        </Text>
      </View>
    </ScrollView>
  );
}