import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { useEffect } from 'react';
import { getMe } from '../src/api/user';
import type { User } from '../src/types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function RouteGuard() {
  const { isReady, isLoggedIn } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data as unknown as { success: boolean; data: User }),
    enabled: isReady && isLoggedIn,
  });

  const user = data?.data;
  const inOnboarding = segments[0] === 'onboarding';
  const inLogin = segments[0] === 'login';
  const inLegal = segments[0] === 'legal';

  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    if (inOnboarding || inLogin || inLegal) return;
    if (!user) return;
    if (user.terms_agreed_at === null) {
      router.replace('/onboarding/terms');
    }
  }, [isReady, isLoggedIn, user?.terms_agreed_at, inOnboarding, inLogin, inLegal]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RouteGuard />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'FocusTimelapse', headerShown: false }} />
        <Stack.Screen name="session-setup" options={{ headerShown: false }} />
        <Stack.Screen name="focus" options={{ headerShown: false }} />
        <Stack.Screen name="result" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="generating" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="saving" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/terms" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="legal/refund" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
