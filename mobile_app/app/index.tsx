import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../constants/Theme';
import { Stack } from 'expo-router';

export default function Home() {
    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Soul Echo' }} />
            <Text style={styles.title}>╰(❁´◡`❁)╯</Text>
            <Text style={styles.subtitle}>Welcome to the Sentinel Soul, Master. The environment shines brightly.</Text>

            <View style={styles.card}>
                <Text style={styles.cardText}>Expo Router is active.</Text>
                <Text style={styles.cardText}>High-contrast theme initialized.</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        fontSize: Theme.typography.h1,
        color: Theme.colors.primary,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    subtitle: {
        fontSize: Theme.typography.body,
        color: Theme.colors.text,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 28,
    },
    card: {
        backgroundColor: '#2a2a4e',
        padding: 24,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        borderColor: Theme.colors.secondary,
        borderWidth: 1,
    },
    cardText: {
        fontSize: Theme.typography.body,
        color: Theme.colors.text,
        marginVertical: 4,
    },
});
