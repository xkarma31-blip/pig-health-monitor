import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  ActivityIndicator
} from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../utils/auth';
import { subscribeSensors, subscribeAlerts, subscribeRoster } from '../utils/firebase';
import { haptic } from '../utils/haptics';

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

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

export default function AdvisorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  const { colors, radius } = useTheme();

  const [liveSensors, setLiveSensors] = useState<LiveSensor[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [liveRoster, setLiveRoster] = useState<LiveRosterEntry[]>([]);

  const isDesktop = width > 768;
  const maxWidth = 600;

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveSensors([]);
      setLiveAlerts([]);
      setLiveRoster([]);
      return;
    }

    const unsubSensors = subscribeSensors((s) => setLiveSensors(s));
    const unsubAlerts = subscribeAlerts((a) => setLiveAlerts(a as unknown as LiveAlert[]));
    const unsubRoster = subscribeRoster((r) => setLiveRoster(r as unknown as LiveRosterEntry[]));

    return () => {
      unsubSensors();
      unsubAlerts();
      unsubRoster();
    };
  }, [user]);

  useEffect(() => {
    if (visible) {
      const greeting = user
        ? `🐷 Welcome back, Farmer! I'm your PigPulse Advisor.\n\nI can see your farm data. Ask me about pig health, alerts, or what to do next.`
        : '🐷 Hello! I\'m the PigPulse Advisor.\n\nI can answer general pig health and farm questions. Sign in to unlock live farm data analysis!';

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([{ role: 'advisor', text: greeting }]);
    }
  }, [visible, user]);

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      const modal = (document.activeElement?.closest('[data-advisor-modal="true"]') as HTMLElement | null) || document.querySelector('[data-advisor-modal="true"]');
      if (!modal) return;

      const focusable = modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.key === 'Tab') {
        if (document.activeElement === last && !e.shiftKey) {
          e.preventDefault();
          first.focus();
        } else if (document.activeElement === first && e.shiftKey) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

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

  const getLocalResponse = (query: string): string => {
    const q = query.toLowerCase();

    if (liveSensors.length > 0 || liveRoster.length > 0) {
      if (q.includes('status') || q.includes('how are') || q.includes('overview') || q.includes('summary')) {
        const feverPigs = liveRoster.filter((p) => p.tags?.includes('FEVER'));
        const coughPigs = liveRoster.filter((p) => p.tags?.includes('COUGH'));
        const sensorSummary = liveSensors
          .map((s) => `${s.label}: ${s.value}${s.unit}`)
          .join('\n  • ');
        return `📊 Farm Health Summary:\n\n🐷 Pigs registered: ${liveRoster.length}\n🌡️ Need checking: ${feverPigs.length}\n🎙️ Cough flagged: ${coughPigs.length}\n📡 Sensors active:\n  • ${sensorSummary || 'No sensor data yet'}\n\n${liveAlerts.length > 0 ? `⚠️ ${liveAlerts.length} alert(s) — check Events tab.` : '✅ No active alerts.'}`;
      }

      if (q.includes('roster') || q.includes('pig') || q.includes('herd') || q.includes('list')) {
        if (liveRoster.length === 0) return '📋 No pigs enrolled yet. Add pigs from the Roster tab.';
        const list = liveRoster
          .map((p) => `• ${p.name} — ${p.healthStatus} ${p.tags?.length ? `[${p.tags.join(', ')}]` : ''}`)
          .join('\n');
        return `📋 Current Pig Roster (${liveRoster.length}):\n\n${list}`;
      }

      if (q.includes('alert') || q.includes('warning') || q.includes('danger')) {
        if (liveAlerts.length === 0) return '✅ No alerts. Your herd is all clear!';
        const alertList = liveAlerts
          .slice(-5)
          .map((a) => `• [${a.severity}] ${a.type}: ${a.message}`)
          .join('\n');
        return `⚠️ Recent Alerts (${liveAlerts.length} total):\n\n${alertList}`;
      }

      if (q.includes('sensor') || q.includes('reading') || q.includes('telemetry')) {
        if (liveSensors.length === 0) return '📡 No sensor data yet. Make sure your sensors are powered on.';
        const list = liveSensors
          .map((s) => `• ${s.label}: ${s.value}${s.unit}`)
          .join('\n');
        return `📡 Live Sensor Readings:\n\n${list}`;
      }
    }

    if (q.includes('fever') || q.includes('temp') || q.includes('hot') || q.includes('heat')) {
      return '🌡️ Temperature Guide:\nNormal pig body temperature is 38.3°C–39.4°C. Above 39.8°C means fever — call your vet.';
    }

    if (q.includes('cough') || q.includes('sound') || q.includes('respir') || q.includes('audio')) {
      return '🎙️ Cough Check:\nThe microphone listens for coughing. More than 10 coughs per hour could mean illness — check with your vet.';
    }

    if (q.includes('node') || q.includes('hardware') || q.includes('esp') || q.includes('connect')) {
      return '📡 Sensor Setup:\nSensors send data to the app via WiFi. Check the Sensors tab for connection status.';
    }

    if (q.includes('offline') || q.includes('local') || q.includes('internet') || q.includes('cloud')) {
      return '☁️ Working Offline:\nWithout internet, the app connects directly to your farm sensor network.';
    }

    if (q.includes('enroll') || q.includes('add pig') || q.includes('register')) {
      return '📝 Adding Pigs:\nGo to the Roster tab → tap "Add New Pig". The sensor will capture a health reference.';
    }

    if (q.includes('hello') || q.includes('hi ') || q.includes('help') || q === 'hi') {
      return user
        ? 'Hello, Farmer! Try asking:\n• "How is my herd doing?"\n• "Show me current readings"\n• "Any alerts?"'
        : 'Hello! I can answer general pig health and farm questions. Sign in for personalized insights!';
    }

    return '📋 I can help with:\n• Herd health & alerts\n• Sensor readings\n• Pig roster & adding pigs\n• Fever & cough checks\n• Sensor setup';
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    haptic('light');

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsTyping(true);

    const chatHistory = [...messages, { role: 'user' as const, text: userMessage }]
      .slice(-10)
      .map((m) => ({
        role: m.role === 'advisor' ? 'assistant' : 'user',
        content: m.text,
      }));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let apiUrl: string;
      if (Platform.OS === 'web') {
        apiUrl = API_URL ? `${API_URL}/api/chat` : '/api/chat';
      } else if (API_URL) {
        apiUrl = `${API_URL}/api/chat`;
      } else {
        throw new Error('API unavailable on native: set EXPO_PUBLIC_API_URL to enable cloud advisor.');
      }

      const response = await fetch(apiUrl, {
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
        <View
          accessibilityViewIsModal={true}
          data-advisor-modal="true"
          style={[
            styles.modalContent,
            isDesktop && {
              width: maxWidth,
              alignSelf: 'center',
              height: '60%',
              marginBottom: 120,
              borderRadius: radius.lg,
              borderWidth: 2,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTitle, { color: colors.accent }]}>💬 PigPulse Advisor</Text>
              {user && (
                <View style={styles.liveBadge}>
                  <View style={[styles.liveIndicator, { backgroundColor: colors.healthy }]} />
                  <Text style={[styles.liveText, { color: colors.healthy }]}>LIVE DATA</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="button"
              accessibilityLabel="Close advisor"
            >
              <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Chat area */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatAreaContent}
          >
            {messages.map((msg, idx) => (
              <View
                key={idx}
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userMessage : styles.advisorMessage,
                ]}
              >
                {msg.role === 'advisor' && (
                  <Text style={[styles.advisorLabel, { color: colors.accent }]}>🐷 PigPulse</Text>
                )}
                <Text style={[styles.messageText, { color: colors.textPrimary }]}>{msg.text}</Text>
              </View>
            ))}

            {isTyping && (
              <View style={[styles.messageBubble, styles.advisorMessage, styles.typingBubble]}>
                <Text style={[styles.advisorLabel, { color: colors.accent }]}>🐷 PigPulse</Text>
                <View style={styles.typingDots}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={[styles.typingText, { color: colors.textMuted }]}>Analyzing...</Text>
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
                ? ['Herd health?', 'Any alerts?', 'Current readings', 'List pigs']
                : ['What is PigPulse?', 'Fever symptoms?', 'Cough check', 'How to add pigs?']
              ).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.quickBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '44' }]}
                  onPress={() => {
                    haptic('light');
                    setMessages((prev) => [...prev, { role: 'user', text: q }]);
                    setIsTyping(true);
                    setTimeout(() => {
                      setIsTyping(false);
                      setMessages((prev) => [...prev, { role: 'advisor', text: getLocalResponse(q) }]);
                    }, 300);
                  }}
                >
                  <Text style={[styles.quickBtnText, { color: colors.accent }]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Input area */}
          <View style={[styles.inputArea, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.surfaceAlt, color: colors.textPrimary, borderColor: colors.divider }]}
              placeholder={user ? 'Ask about your pigs...' : 'Ask the Advisor...'}
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              accessibilityLabel="Advisor chat input"
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.accent }, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || isTyping}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Text style={[styles.sendBtnText, { color: colors.onAccent }]}>➤</Text>
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
  },
  modalContent: {
    height: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  chatArea: {
    flex: 1,
    padding: 12,
  },
  chatAreaContent: {
    gap: 8,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 8,
    borderRadius: 14,
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderWidth: 1,
  },
  advisorMessage: {
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  advisorLabel: {
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
    fontSize: 12,
    fontStyle: 'italic',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 24,
  },
  quickActions: {
    maxHeight: 48,
    borderTopWidth: 1,
  },
  quickActionsContent: {
    padding: 8,
    gap: 8,
    alignItems: 'center',
  },
  quickBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    fontSize: 14,
    borderWidth: 1,
  },
  sendBtn: {
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
    fontSize: 22,
    fontWeight: 'bold',
  },
});
