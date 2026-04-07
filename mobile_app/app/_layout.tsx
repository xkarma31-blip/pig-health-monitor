import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Theme } from '../constants/Theme';
import { View } from 'react-native';

export default function RootLayout() {
    return (
        <View style={{ flex: 1, backgroundColor: Theme.colors.background }}>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: {
                        backgroundColor: Theme.colors.background,
                    },
                    headerTintColor: Theme.colors.text,
                    headerTitleStyle: {
                        fontWeight: 'bold',
                        fontSize: Theme.typography.h2,
                    },
                    contentStyle: {
                        backgroundColor: Theme.colors.background,
                    },
                }}
            />
        </View>
    );
}
