import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'FocusTimelapse', headerShown: false }} />
        <Stack.Screen
          name="session-setup"
          options={{
            title: 'Session Setup',
            headerStyle: { backgroundColor: '#F5F3EF' },
            headerTintColor: '#1A1A2E',
          }}
        />
        <Stack.Screen name="focus" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ title: 'Stats' }} />
      </Stack>
    </QueryClientProvider>
  );
}
