import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { Theme } from '../constants/Theme';

interface Message {
  role: 'user' | 'advisor';
  text: string;
}

export default function AdvisorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'advisor', text: 'Hello! I am your AI Pig Health Advisor. How can I assist you with your herd today? 🐗' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();
  
  const isDesktop = width > 768;
  const maxWidth = 600;

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages, isTyping]);

  // Instant local AI expert systems mapping (highly realistic veterinary/IoT response)
  const getAIResponse = (query: string): string => {
    const q = query.toLowerCase();
    
    if (q.includes('fever') || q.includes('temp') || q.includes('hot') || q.includes('heat')) {
      return "🌡️ Thermal Biometrics:\nNormal pig core temperature is 38.3°C - 39.4°C. An elevated cluster reaching 39.8°C+ denotes a fever. If a fever is detected on Node B (MLX90640), isolate the animal, verify pen ventilation, and monitor hydration levels.";
    }
    
    if (q.includes('cough') || q.includes('sound') || q.includes('respir') || q.includes('audio')) {
      return "🎙️ Acoustic Diagnostics:\nOur Node A (INMP441) acoustic sensor tracks coughing fits. If the cough count exceeds 10 per hour, it is a clinical marker for swine influenza or PRRS. Ensure dust suppression protocols are active and review humidity settings.";
    }

    if (q.includes('node') || q.includes('hardware') || q.includes('esp') || q.includes('connect')) {
      return "📡 Hardware Connectivity:\nThe system employs low-power ESP32 nodes transmitting via ESP-NOW. Ensure Node A (INMP441 acoustic) and Node B (MLX90640 thermal) are within a 100m radius of the central gateway. Battery levels can be tracked in the 'Nodes' tab.";
    }

    if (q.includes('offline') || q.includes('local') || q.includes('internet') || q.includes('cloud')) {
      return "☁️ Local-First Architecture:\nEven with zero internet, the app works flawlessly by connecting directly to the ESP32 Gateway AP at http://192.168.4.1/data. Cloud databases will synchronize automatically once WAN is restored and authorized credentials are provided.";
    }

    if (q.includes('peppa')) {
      return "🎯 Patient Record (Peppa):\nPeppa is currently showing an elevated thermal signature (39.5°C) in the latest scan. Isolation is recommended to prevent herd transmission until a visual veterinary examination is completed.";
    }

    if (q.includes('boss hog')) {
      return "✅ Patient Record (Boss Hog):\nBoss Hog is exhibiting completely stable biometric readings (38.2°C temperature) with zero acoustic triggers in the last 24 hours.";
    }

    if (q.includes('hello') || q.includes('hi') || q.includes('help')) {
      return "Hello! I am your interactive veterinary and IoT engineering assistant. I can interpret MLX90640 thermal heatmaps, INMP441 cough frequency spikes, or check ESP-NOW gateway diagnostics. What would you like to check?";
    }

    return "📋 Diagnostic Advisor:\nI have scanned your active telemetry list. To ensure optimal herd health: \n1) Verify Node A battery is above 30%.\n2) Check thermal sensor matrix for fever tags.\n3) Ensure fresh feed supply in Sector B.";
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsTyping(true);

    // Dynamic instant response (150ms delay to feel naturally active, but highly responsive!)
    setTimeout(() => {
      setIsTyping(false);
      const aiReply = getAIResponse(userMessage);
      setMessages(prev => [...prev, { role: 'advisor', text: aiReply }]);
    }, 200);
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
          isDesktop && { width: maxWidth, alignSelf: 'center', height: '60%', marginBottom: 120, borderRadius: Theme.borderRadius.lg, borderWidth: 2 }
        ]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>💬 Advisor Interface</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          
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
                <Text style={styles.messageText}>{msg.text}</Text>
              </View>
            ))}

            {isTyping && (
              <View style={[styles.messageBubble, styles.advisorMessage, styles.typingBubble]}>
                <ActivityIndicator color={Theme.colors.primary} size="small" />
              </View>
            )}
          </ScrollView>

          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              placeholder="Ask the Advisor..."
              placeholderTextColor={Theme.colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
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
    backgroundColor: 'rgba(13, 13, 26, 0.8)',
  },
  modalContent: {
    height: '80%',
    backgroundColor: Theme.colors.background,
    borderTopLeftRadius: Theme.borderRadius.lg,
    borderTopRightRadius: Theme.borderRadius.lg,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: Theme.colors.cardBorder,
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
  headerTitle: {
    color: Theme.colors.primary,
    fontSize: Theme.typography.h3,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: Theme.spacing.xs,
  },
  closeBtnText: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h3,
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
    backgroundColor: Theme.colors.primaryDim,
  },
  advisorMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.colors.card,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  typingBubble: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    color: Theme.colors.text,
    fontSize: Theme.typography.body,
    lineHeight: 22,
  },
  inputArea: {
    flexDirection: 'row',
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Theme.colors.card,
    color: Theme.colors.text,
    padding: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    fontSize: Theme.typography.body,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  sendBtn: {
    backgroundColor: Theme.colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#0D0D1A',
    fontSize: 20,
    fontWeight: 'bold',
  }
});
