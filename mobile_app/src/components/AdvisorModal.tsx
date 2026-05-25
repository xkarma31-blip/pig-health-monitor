import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  ActivityIndicator
} from 'react-native';
import { Theme } from '../constants/Theme';
import { useAuth } from '../utils/auth';
import { subscribeSensors, subscribeAlerts, subscribeRoster } from '../utils/firebase';

interface LiveSensor {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: string;
  lastUpdated: string;
}

interface LiveAlert {
  id: string;
  type?: string;
  severity?: string;
  message?: string;
  deviceId?: string;
}

interface LiveRosterEntry {
  id: string;
  name: string;
  healthStatus: string;
  tags?: string[];
  lastSeen?: string;
}

interface Message {
  role: 'user' | 'advisor';
  text: string;
}

/**
 * PigPulse Advisor — AI-powered swine health consultant.
 *
 * When the user is authenticated, the advisor pulls live sensor readings,
 * active alerts, and the full pig roster from Firebase and injects them
 * into the system prompt so the AI model can give data-aware answers.
 *
 * Falls back to a capable local keyword engine when the API is
 * unreachable or the user is unauthenticated.
 */
export default function AdvisorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();

  // Live Firebase state
  const [liveSensors, setLiveSensors] = useState<LiveSensor[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [liveRoster, setLiveRoster] = useState<LiveRosterEntry[]>([]);

  const isDesktop = width > 768;
  const maxWidth = 600;

  // ------------------------------------------------------------------
  // Subscribe to live data when authenticated
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setLiveSensors([]);
      setLiveAlerts([]);
      setLiveRoster([]);
      return;
    }

    const unsubSensors = subscribeSensors((s) => setLiveSensors(s));
    const unsubAlerts = subscribeAlerts((a) => setLiveAlerts(a));
    const unsubRoster = subscribeRoster((r) => setLiveRoster(r));

    return () => {
      unsubSensors();
      unsubAlerts();
      unsubRoster();
    };
  }, [user]);

  // ------------------------------------------------------------------
  // Greeting message — reset when modal opens
  // ------------------------------------------------------------------
  useEffect(() => {
    if (visible) {
      const greeting = user
        ? `🐷 Welcome back, Farmer! I'm your PigPulse Advisor.\n\nI have live access to your farm data:\n• ${liveSensors.length} sensor(s) online\n• ${liveAlerts.length} active alert(s)\n• ${liveRoster.length} pig(s) in the roster\n\nAsk me anything about your herd's health, sensor readings, or veterinary guidance.`
        : '🐷 Hello! I\'m the PigPulse Advisor.\n\nI can answer general swine health and IoT questions. Log in to unlock live farm data analysis!';

      setMessages([{ role: 'advisor', text: greeting }]);
    }
    // Intentional: reset greeting only on modal open, not on live data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ------------------------------------------------------------------
  // Auto-scroll
  // ------------------------------------------------------------------
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, isTyping]);

  // ------------------------------------------------------------------
  // Build a compact context snapshot for the system prompt
  // ------------------------------------------------------------------
  const buildContext = useCallback(() => {
    const ctx: Record<string, unknown> = {};

    if (liveSensors.length > 0) {
      ctx.sensors = liveSensors.map((s) => ({
        id: s.id,
        label: s.label,
        value: s.value,
        unit: s.unit,
        status: s.status,
        lastUpdated: s.lastUpdated,
      }));
    }

    if (liveAlerts.length > 0) {
      // Send the 10 most recent alerts to avoid exceeding token limits
      ctx.recentAlerts = liveAlerts.slice(-10).map((a) => ({
        type: a.type,
        severity: a.severity,
        message: a.message,
        deviceId: a.deviceId,
      }));
    }

    if (liveRoster.length > 0) {
      ctx.roster = liveRoster.map((p) => ({
        name: p.name,
        healthStatus: p.healthStatus,
        tags: p.tags,
        lastSeen: p.lastSeen,
      }));
    }

    return ctx;
  }, [liveSensors, liveAlerts, liveRoster]);

  // ------------------------------------------------------------------
  // Local fallback engine (keyword-matching, no network needed)
  // ------------------------------------------------------------------
  const getLocalResponse = (query: string): string => {
    const q = query.toLowerCase();

    // Data-aware answers when we have live data
    if (liveSensors.length > 0 || liveRoster.length > 0) {
      if (q.includes('status') || q.includes('how are') || q.includes('overview') || q.includes('summary')) {
        const feverPigs = liveRoster.filter((p) => p.tags?.includes('FEVER'));
        const coughPigs = liveRoster.filter((p) => p.tags?.includes('COUGH'));
        const sensorSummary = liveSensors
          .map((s) => `${s.label}: ${s.value}${s.unit} (${s.status})`)
          .join('\n  • ');
        return `📊 Farm Status Summary:\n\n🐷 Roster: ${liveRoster.length} pig(s) registered\n🌡️ Fever flagged: ${feverPigs.length}\n🎙️ Cough flagged: ${coughPigs.length}\n📡 Active Sensors:\n  • ${sensorSummary || 'No sensor data yet'}\n\n${liveAlerts.length > 0 ? `⚠️ ${liveAlerts.length} active alert(s) — check Events tab for details.` : '✅ No active alerts.'}`;
      }

      if (q.includes('roster') || q.includes('pig') || q.includes('herd') || q.includes('list')) {
        if (liveRoster.length === 0) return '📋 The roster is empty. Enroll pigs from the Analytics tab.';
        const list = liveRoster
          .map((p) => `• ${p.name} — ${p.healthStatus} ${p.tags?.length ? `[${p.tags.join(', ')}]` : ''}`)
          .join('\n');
        return `📋 Current Pig Roster (${liveRoster.length}):\n\n${list}`;
      }

      if (q.includes('alert') || q.includes('warning') || q.includes('danger')) {
        if (liveAlerts.length === 0) return '✅ No active alerts. Your herd is all clear!';
        const alertList = liveAlerts
          .slice(-5)
          .map((a) => `• [${a.severity}] ${a.type}: ${a.message}`)
          .join('\n');
        return `⚠️ Recent Alerts (${liveAlerts.length} total):\n\n${alertList}`;
      }

      if (q.includes('sensor') || q.includes('reading') || q.includes('telemetry')) {
        if (liveSensors.length === 0) return '📡 No sensor data available yet. Ensure your ESP32 nodes are powered on.';
        const list = liveSensors
          .map((s) => `• ${s.label}: ${s.value}${s.unit} — ${s.status} (updated ${s.lastUpdated})`)
          .join('\n');
        return `📡 Live Sensor Readings:\n\n${list}`;
      }
    }

    // General knowledge fallbacks
    if (q.includes('fever') || q.includes('temp') || q.includes('hot') || q.includes('heat')) {
      return '🌡️ Thermal Biometrics:\nNormal pig core temperature is 38.3°C–39.4°C. Readings above 39.8°C indicate fever. If detected by the MLX90640 thermal array, isolate the animal, verify ventilation, and monitor hydration.';
    }

    if (q.includes('cough') || q.includes('sound') || q.includes('respir') || q.includes('audio')) {
      return '🎙️ Acoustic Diagnostics:\nThe INMP441 acoustic sensor tracks coughing patterns. >10 coughs/hour is a clinical marker for swine influenza or PRRS. Activate dust suppression and review humidity settings immediately.';
    }

    if (q.includes('node') || q.includes('hardware') || q.includes('esp') || q.includes('connect')) {
      return '📡 Hardware Connectivity:\nESP32-S3 nodes transmit via WiFi to Firebase RTDB. Ensure Node A (acoustic) and Node B (thermal) are within range of your AP. Check the Nodes tab for connectivity status.';
    }

    if (q.includes('offline') || q.includes('local') || q.includes('internet') || q.includes('cloud')) {
      return '☁️ Local-First Architecture:\nEven without internet, the app connects directly to the ESP32 Gateway AP at 192.168.4.1. Cloud sync resumes automatically once WAN is restored.';
    }

    if (q.includes('enroll') || q.includes('add pig') || q.includes('register')) {
      return '📝 Pig Enrollment:\nGo to the Analytics tab → tap "Enroll New Pig". The ESP32 will capture a thermal reference embedding for identification. Each farm supports up to 50 pigs.';
    }

    if (q.includes('hello') || q.includes('hi ') || q.includes('help') || q === 'hi') {
      return user
        ? 'Hello, Farmer! I have access to your live farm data. Try asking:\n• "What is the status of my herd?"\n• "Show me current sensor readings"\n• "Any active alerts?"\n• "List all pigs in the roster"'
        : 'Hello! I can answer general swine health and IoT questions. Log in to get personalized, data-driven insights about your farm!';
    }

    return '📋 I can help with:\n• Herd health status & alerts\n• Sensor readings & telemetry\n• Pig roster & enrollment\n• Fever/cough diagnostics\n• Hardware connectivity\n\nTry asking a specific question!';
  };

  // ------------------------------------------------------------------
  // Send message — try API first, fall back to local engine
  // ------------------------------------------------------------------
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsTyping(true);

    // Build chat history for the API (last 10 messages to stay within limits)
    const chatHistory = [...messages, { role: 'user' as const, text: userMessage }]
      .slice(-10)
      .map((m) => ({
        role: m.role === 'advisor' ? 'assistant' : 'user',
        content: m.text,
      }));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          context: buildContext(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`API ${response.status}`);

      const data = await response.json();
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: 'advisor', text: data.reply }]);
    } catch {
      // Network error or timeout — use local fallback
      setIsTyping(false);
      const localReply = getLocalResponse(userMessage);
      setMessages((prev) => [...prev, { role: 'advisor', text: localReply }]);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[
          styles.modalContent,
          isDesktop && {
            width: maxWidth,
            alignSelf: 'center' as const,
            height: '60%',
            marginBottom: 120,
            borderRadius: Theme.borderRadius.lg,
            borderWidth: 2,
          }
        ]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>💬 PigPulse Advisor</Text>
              {user && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveIndicator} />
                  <Text style={styles.liveText}>LIVE DATA</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Chat area */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatAreaContent}
          >
            {messages.map((msg, idx) => (
              <View key={idx} style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userMessage : styles.advisorMessage
              ]}>
                {msg.role === 'advisor' && (
                  <Text style={styles.advisorLabel}>🐷 PigPulse</Text>
                )}
                <Text style={styles.messageText}>{msg.text}</Text>
              </View>
            ))}

            {isTyping && (
              <View style={[styles.messageBubble, styles.advisorMessage, styles.typingBubble]}>
                <Text style={styles.advisorLabel}>🐷 PigPulse</Text>
                <View style={styles.typingDots}>
                  <ActivityIndicator color={Theme.colors.primary} size="small" />
                  <Text style={styles.typingText}>Analyzing...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Quick actions row */}
          {messages.length <= 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.quickActions}
              contentContainerStyle={styles.quickActionsContent}
            >
              {(user
                ? ['Herd status?', 'Any alerts?', 'Sensor readings', 'List roster']
                : ['What is PigPulse?', 'Fever symptoms?', 'Cough detection', 'How to enroll?']
              ).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.quickBtn}
                  onPress={() => {
                    setInput(q);
                    // Small delay so user sees the input before sending
                    setTimeout(() => {
                      setInput('');
                      setMessages((prev) => [...prev, { role: 'user', text: q }]);
                      setIsTyping(true);
                      setTimeout(() => {
                        setIsTyping(false);
                        setMessages((prev) => [...prev, { role: 'advisor', text: getLocalResponse(q) }]);
                      }, 300);
                    }, 100);
                  }}
                >
                  <Text style={styles.quickBtnText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Input area */}
          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              placeholder={user ? 'Ask about your farm data...' : 'Ask the Advisor...'}
              placeholderTextColor={Theme.colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || isTyping}
            >
              <Text style={styles.sendBtnText}>➤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(5, 5, 10, 0.85)',
  },
  modalContent: {
    height: '80%',
    backgroundColor: Theme.colors.background,
    borderTopLeftRadius: Theme.borderRadius.lg,
    borderTopRightRadius: Theme.borderRadius.lg,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: Theme.colors.primary + '66',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: Theme.colors.primary,
    fontSize: Theme.typography.h3,
    fontWeight: 'bold',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.success + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: Theme.colors.success + '44',
    gap: 5,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.colors.success,
  },
  liveText: {
    color: Theme.colors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: Theme.spacing.xs,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.card,
    borderRadius: 18,
  },
  closeBtnText: {
    color: Theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  chatArea: {
    flex: 1,
    padding: Theme.spacing.md,
  },
  chatAreaContent: {
    gap: Theme.spacing.sm,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Theme.colors.primary + '22',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '44',
  },
  advisorMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.colors.card,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  advisorLabel: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  messageText: {
    color: Theme.colors.text,
    fontSize: Theme.typography.body,
    lineHeight: 24,
  },
  quickActions: {
    maxHeight: 48,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.cardBorder,
  },
  quickActionsContent: {
    padding: 8,
    gap: 8,
    alignItems: 'center',
  },
  quickBtn: {
    backgroundColor: Theme.colors.primary + '15',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '44',
    borderRadius: Theme.borderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  quickBtnText: {
    color: Theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  inputArea: {
    flexDirection: 'row',
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    gap: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.cardBorder,
  },
  input: {
    flex: 1,
    backgroundColor: Theme.colors.card,
    color: Theme.colors.text,
    padding: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.pill,
    fontSize: Theme.typography.body,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  sendBtn: {
    backgroundColor: Theme.colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: '#0D0D1A',
    fontSize: 22,
    fontWeight: 'bold',
  },
});
