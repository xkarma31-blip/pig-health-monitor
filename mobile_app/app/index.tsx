import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../constants/Theme';
import { Stack } from 'expo-router';

export default function Home() {
    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Stack.Screen options={{ title: 'Pig Health Dashboard' }} />
            
            <View style={styles.header}>
                <Text style={styles.title}>Pig Health Monitor</Text>
                <Text style={styles.subtitle}>Sovereign Aqua Protocol System Active</Text>
            </View>

            <View style={styles.grid}>
                {/* Thermal Sensor Card */}
                <View style={[styles.card, { borderLeftColor: '#ff4d4d' }]}>
                    <Text style={styles.cardHeader}>🌡️ Thermal Sensor</Text>
                    <Text style={styles.valueWarning}>39.5°C</Text>
                    <Text style={styles.cardDetail}>Status: Slightly Elevated</Text>
                </View>

                {/* Acoustic Sensor Card */}
                <View style={[styles.card, { borderLeftColor: '#00d2ff' }]}>
                    <Text style={styles.cardHeader}>🩺 Acoustic Analysis</Text>
                    <Text style={styles.valueNormal}>Stable</Text>
                    <Text style={styles.cardDetail}>Anomaly Detection: 0% cough rate</Text>
                </View>

                {/* Flow / Bubble Sensor Card */}
                <View style={[styles.card, { borderLeftColor: '#3a86ff' }]}>
                    <Text style={styles.cardHeader}>🫧 Fluid Flow & Oxygen</Text>
                    <Text style={styles.valueNormal}>Optimal</Text>
                    <Text style={styles.cardDetail}>Bubble count detected: 2/min</Text>
                </View>
            </View>
            
            <View style={styles.footer}>
                <Text style={styles.footerText}>Team: Cross-Platform (Web & Mobile) Sync Enabled</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    header: {
        marginBottom: 32,
        alignItems: 'center',
    },
    title: {
        fontSize: Theme.typography.h1,
        color: Theme.colors.primary,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: Theme.typography.body,
        color: Theme.colors.secondary,
        textAlign: 'center',
        marginTop: 8,
    },
    grid: {
        width: '100%',
        maxWidth: 600,
        gap: 16,
    },
    card: {
        backgroundColor: '#1E1E30',
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2A2A40',
        borderLeftWidth: 6,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    cardHeader: {
        fontSize: 18,
        color: '#E0E0E0',
        fontWeight: '600',
        marginBottom: 8,
    },
    valueNormal: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#00d2ff', // Aqua blue
        marginBottom: 4,
    },
    valueWarning: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ff4d4d', // Red Warning
        marginBottom: 4,
    },
    cardDetail: {
        fontSize: 14,
        color: '#8A8A9E',
    },
    footer: {
        marginTop: 40,
        padding: 16,
        backgroundColor: '#1A1A24',
        borderRadius: 8,
        width: '100%',
        maxWidth: 600,
    },
    footerText: {
        color: '#A0A0B0',
        textAlign: 'center',
        fontSize: 12,
    }
});
