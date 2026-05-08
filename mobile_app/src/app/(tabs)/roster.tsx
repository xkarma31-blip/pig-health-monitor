/**
 * 🐗 Pig Roster Screen (Tab 4 — Sovereign Roster)
 * 
 * Manage your familiars, identify new ones, and monitor health tags.
 * Includes 'Mountain Mode' for offline local sync.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Alert, Switch } from 'react-native';
import { Theme } from '../../constants/Theme';
import { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';
import { subscribeRoster, enrollPig, updatePigHealth } from '../../utils/firebase';
import { getAuth } from 'firebase/auth';

export default function RosterScreen() {
  const [roster, setRoster] = useState<any[]>([]);
  const [mountainMode, setMountainMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubAuth = getAuth().onAuthStateChanged((user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setRoster([]);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = subscribeRoster((data) => {
      setRoster(data);
    });
    return () => unsub();
  }, [isAuthenticated]);

  const handleQuickEnroll = async () => {
    const tempName = `TEMP-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await enrollPig(tempName, true);
      Alert.alert('✨ Ritual Successful', `Familiar ${tempName} has been temporarily bound. Please name it later.`);
    } catch (e: any) {
      Alert.alert('❌ Ritual Failed', e.message);
    }
  };

  const toggleTag = async (pig: any, tag: string) => {
    const newTags = pig.tags.includes(tag)
      ? pig.tags.filter((t: string) => t !== tag)
      : [...pig.tags, tag];
    
    try {
      await updatePigHealth(pig.id, newTags, newTags.length > 0 ? 'WARNING' : 'NORMAL');
    } catch (e: any) {
      Alert.alert('❌ Update Failed', e.message);
    }
  };

  return (
<ResponsiveLayout>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === Mountain Mode Toggle === */}
      <View style={styles.mountainBox}>
        <View>
          <Text style={styles.mountainTitle}>🏔️ Mountain Mode</Text>
          <Text style={styles.mountainDesc}>Local direct sync (No Internet)</Text>
        </View>
        <Switch 
          value={mountainMode} 
          onValueChange={setMountainMode}
          trackColor={{ false: '#333', true: Theme.colors.primary }}
        />
      </View>

      {/* === Roster Stats === */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{roster.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, {color: Theme.colors.success}]}>
            {roster.filter(p => {
              const lastSeenMs = typeof p.lastSeen === 'number' ? p.lastSeen : new Date(p.lastSeen).getTime();
              return new Date().getTime() - lastSeenMs <= 300000;
            }).length}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, {color: Theme.colors.danger}]}>
            {roster.filter(p => p.temperature != null && p.temperature > 39.5).length}
          </Text>
          <Text style={styles.statLabel}>Fevers</Text>
        </View>
      </View>

      {/* === Actions === */}
      <TouchableOpacity style={styles.enrollBtn} onPress={handleQuickEnroll}>
        <Text style={styles.enrollBtnText}>✨ QUICK ENROLL TEMPORARY PIG</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Pig Roster ({roster.length})</Text>

      {roster.map((pig) => {
        const lastSeenMs = typeof pig.lastSeen === 'number' ? pig.lastSeen : new Date(pig.lastSeen).getTime();
        const isInactive = new Date().getTime() - lastSeenMs > 300000; // 5 mins no signal
        const temp = pig.temperature;
        const hasFever = temp != null && temp > 39.5;
        
        return (
          <View key={pig.id} style={[styles.pigCard, isInactive && styles.inactiveCard, hasFever && styles.feverCard]}>
            <View style={styles.pigHeader}>
              <View>
                <Text style={styles.pigName}>{pig.name}</Text>
                {pig.isTemporary && (
                  <TouchableOpacity onPress={() => Alert.alert('Enrollment', 'This pig was auto-enrolled. Tap to assign a permanent name.')}>
                    <Text style={styles.tempBadge}>⚠️ UNIDENTIFIED — TAP TO NAME</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={[styles.statusText, isInactive ? {color: Theme.colors.warning} : {color: Theme.colors.success}]}>
                  {isInactive ? '⚠️ NO SIGNAL' : '✅ ACTIVE'}
                </Text>
                {temp != null && (
                  <Text style={[styles.tempValue, hasFever ? {color: Theme.colors.danger} : {color: Theme.colors.success}]}>
                    {temp.toFixed(1)}°C
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.tagRow}>
              {['FEVER', 'RESPIRATORY_DISTRESS', 'LETHARGIC'].map(tag => (
                <TouchableOpacity 
                  key={tag} 
                  onPress={() => toggleTag(pig, tag)}
                  style={[styles.tag, pig.tags.includes(tag) && styles.tagActive]}
                >
                  <Text style={[styles.tagText, pig.tags.includes(tag) && styles.tagTextActive]}>
                    {tag === 'FEVER' ? '🌡️ Fever' : tag === 'RESPIRATORY_DISTRESS' ? '🫁 Resp. Distress' : '😴 Lethargic'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.lastSeen}>Last Seen: {new Date(lastSeenMs).toLocaleTimeString()}</Text>
          </View>
        );
      })}
    </ScrollView>
</ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.lg,
  },
  mountainBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '66',
    marginBottom: Theme.spacing.lg,
  },
  mountainTitle: {
    color: Theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  mountainDesc: {
    color: Theme.colors.textMuted,
    fontSize: 12,
  },
  enrollBtn: {
    backgroundColor: Theme.colors.primary,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
    alignItems: 'center',
    marginBottom: Theme.spacing.xl,
  },
  enrollBtnText: {
    color: '#000',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.md,
  },
  pigCard: {
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  inactiveCard: {
    borderColor: Theme.colors.warning,
    backgroundColor: Theme.colors.warning + '11',
  },
  feverCard: {
    borderColor: Theme.colors.danger,
    backgroundColor: Theme.colors.danger + '11',
  },
  tempValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  pigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.sm,
  },
  pigName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Theme.colors.text,
  },
  tempBadge: {
    color: Theme.colors.warning,
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Theme.colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.textMuted,
  },
  tagActive: {
    backgroundColor: Theme.colors.warning,
    borderColor: Theme.colors.warning,
  },
  tagText: {
    color: Theme.colors.textMuted,
    fontSize: 12,
  },
  tagTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  lastSeen: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginTop: 12,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.lg,
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  statNum: {
    color: Theme.colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
