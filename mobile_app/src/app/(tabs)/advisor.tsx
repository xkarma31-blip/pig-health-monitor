import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Modal,
  useWindowDimensions
} from 'react-native';
import { Theme } from '../../constants/Theme';
import { GlassCard } from '../../components/UI/GlassCard';
import { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'advisor';
  timestamp: Date;
}

export default function AdvisorScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello Master. I am the HUSH HOG Advisor. I have analyzed the current telemetry. Peppa's temperature is slightly elevated (39.5°C). Would you like me to check the acoustic logs for cough patterns?",
      sender: 'advisor',
      timestamp: new Date(),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const sendMessage = async () => {
    if (inputText.trim() === '') return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInputText('');
    setIsTyping(true);

    try {
      // Map conversation history for the AI
      const apiMessages = currentMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));

      // Determine API URL based on platform
      const apiUrl = Platform.OS === 'web' 
        ? '/api/chat' 
        : 'https://pig-health-monitor.vercel.app/api/chat';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: apiMessages,
          context: { status: "Monitoring active. Please provide advice based on user input." }
        })
      });

      const data = await response.json();
      
      if (data.reply) {
        const advisorMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: data.reply,
          sender: 'advisor',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, advisorMsg]);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "⚠️ Connection to Sentinel Soul interrupted. The AI backend may be offline or unreachable.",
        sender: 'advisor',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <ResponsiveLayout>
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEmoji}>🤖</Text>
          <Text style={styles.headerTitle}>HUSH HOG ADVISOR</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>SIMULATION</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.sessionsButton} onPress={() => setShowSessions(true)}>
          <Text style={styles.sessionsButtonText}>SESSIONS</Text>
        </TouchableOpacity>
      </View>

      {/* Sessions Modal */}
      <Modal visible={showSessions} animationType="fade" transparent={true} onRequestClose={() => setShowSessions(false)}>
        <View style={[styles.modalOverlay, isDesktop && { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.modalContent, isDesktop && { width: 500, borderRadius: 20, maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Past Sessions</Text>
              <TouchableOpacity onPress={() => setShowSessions(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity style={styles.sessionItem} onPress={() => setShowSessions(false)}>
                <Text style={styles.sessionTitle}>Today: Cough Analysis (Peppa)</Text>
                <Text style={styles.sessionDate}>Just now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sessionItem} onPress={() => setShowSessions(false)}>
                <Text style={styles.sessionTitle}>Yesterday: Weekly Health Review</Text>
                <Text style={styles.sessionDate}>May 7, 2026</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sessionItem} onPress={() => setShowSessions(false)}>
                <Text style={styles.sessionTitle}>Roster Config & Node 2 Status</Text>
                <Text style={styles.sessionDate}>May 5, 2026</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.chatContainer}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View 
            key={msg.id} 
            style={[
              styles.messageWrapper, 
              msg.sender === 'user' ? styles.userWrapper : styles.advisorWrapper
            ]}
          >
            <View style={[
              styles.bubble, 
              msg.sender === 'user' ? styles.userBubble : styles.advisorBubble
            ]}>
              <Text style={styles.messageText}>{msg.text}</Text>
              <Text style={styles.timestamp}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        ))}
        {isTyping && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={Theme.colors.accent} />
            <Text style={styles.typingText}>Advisor is thinking...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputArea}>
        <GlassCard style={styles.inputGlass}>
          <TextInput
            style={styles.input}
            placeholder="Ask about pig health..."
            placeholderTextColor={Theme.colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendIcon}>🚀</Text>
          </TouchableOpacity>
        </GlassCard>
      </View>
    </KeyboardAvoidingView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    backgroundColor: Theme.colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerEmoji: {
    fontSize: 20,
  },
  headerTitle: {
    color: Theme.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerBadge: {
    backgroundColor: Theme.colors.warning + '33',
    borderWidth: 1,
    borderColor: Theme.colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerBadgeText: {
    color: Theme.colors.warning,
    fontSize: 10,
    fontWeight: 'bold',
  },
  sessionsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Theme.colors.primary + '22',
    borderWidth: 1,
    borderColor: Theme.colors.primary,
  },
  sessionsButtonText: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: '50%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Theme.colors.text,
  },
  modalCloseText: {
    fontSize: 20,
    color: Theme.colors.textMuted,
  },
  sessionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder + '66',
  },
  sessionTitle: {
    color: Theme.colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  sessionDate: {
    color: Theme.colors.textMuted,
    fontSize: 12,
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 32,
  },
  messageWrapper: {
    marginBottom: 16,
    flexDirection: 'row',
    width: '100%',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  advisorWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: Theme.colors.accent + '33',
    borderColor: Theme.colors.accent,
    borderBottomRightRadius: 2,
  },
  advisorBubble: {
    backgroundColor: Theme.colors.surface + '88',
    borderColor: Theme.colors.cardBorder,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    color: Theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  timestamp: {
    color: Theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  typingText: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginLeft: 8,
    fontStyle: 'italic',
  },
  inputArea: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  inputGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 24,
  },
  input: {
    flex: 1,
    color: Theme.colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  sendIcon: {
    fontSize: 18,
  },
});
