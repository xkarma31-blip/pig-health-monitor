import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator
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
  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = () => {
    if (inputText.trim() === '') return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // Simulation of AI Response (In production, this would hit Groq/OpenRouter)
    setTimeout(() => {
      const advisorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "I am processing your request through the Sentinel Soul core... [SIMULATION] Acoustic analysis shows no significant cough clusters in the last 2 hours. The thermal spike seems localized. Recommendation: Monitor hydration levels in Pen 1.",
        sender: 'advisor',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, advisorMsg]);
      setIsTyping(false);
    }, 1500);
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
        <Text style={styles.headerEmoji}>🤖</Text>
        <Text style={styles.headerTitle}>HUSH HOG ADVISOR</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>SIMULATION</Text>
        </View>
      </View>

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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    backgroundColor: Theme.colors.surface,
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
