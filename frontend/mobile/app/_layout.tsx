import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../src/auth/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'FocusTimelapse', headerShown: false }} />
        <Stack.Screen name="session-setup" options={{ headerShown: false }} />
        <Stack.Screen name="focus" options={{ headerShown: false }} />
        <Stack.Screen name="result" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="generating" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="saving" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
