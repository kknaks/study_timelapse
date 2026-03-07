import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getMe } from '../src/api/user';
import { getWeeklyStats } from '../src/api/stats';
import { loginWithGoogle } from '../src/api/auth';
import { tokenStore } from '../src/auth/tokenStore';
import { COLORS } from '../src/constants';
import type { User, WeeklyStats } from '../src/types';
import { useEffect, useState } from 'react';

GoogleSignin.configure({
  iosClientId: '804697996965-2nen6lpvc0pgt2vas6vbai5hl9i4ufjk.apps.googleusercontent.com',
  webClientId: '804697996965-uiu9k5epfpbkgigmcmdpbgofmi9si3ak.apps.googleusercontent.com',
  scopes: ['profile', 'email'],
});

function formatTodayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatWeeklyTime(seconds: number): string {
  const h = (seconds / 3600).toFixed(1);
  return `${h}h`;
}

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 앱 시작 시 토큰 확인
  useEffect(() => {
    tokenStore.getAccessToken().then((token) => {
      setIsLoggedIn(!!token);
    });
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No ID token received');

      const res = await loginWithGoogle(idToken);
      const { access_token, refresh_token } = res.data.data.tokens;
      await tokenStore.saveTokens(access_token, refresh_token);

      setIsLoggedIn(true);
      queryClient.invalidateQueries();
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('Sign In Failed', error.message || 'Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await GoogleSignin.signOut();
    await tokenStore.clearTokens();
    setIsLoggedIn(false);
    queryClient.invalidateQueries();
  };

  const { data: userData } = useQuery<{ success: boolean; data: User }>({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
    enabled: isLoggedIn,
  });

  const { data: statsData } = useQuery<{ success: boolean; data: WeeklyStats }>({
    queryKey: ['weekly-stats'],
    queryFn: () => getWeeklyStats().then((r) => r.data),
    enabled: isLoggedIn,
  });

  const user = userData?.data;
  const stats = statsData?.data;

  const todaySeconds = stats?.daily?.find((d) => {
    const today = new Date().toISOString().split('T')[0];
    return d.date === today;
  })?.total_seconds ?? 0;

  const weeklySeconds = stats?.total_seconds ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>FocusTimelapse</Text>
          <Text style={styles.tagline}>Turn your focus into content.</Text>
        </View>

        {/* Start Button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.push('/session-setup')}
          activeOpacity={0.85}
        >
          <Text style={styles.startIcon}>▶</Text>
          <Text style={styles.startText}>Start Focus Session</Text>
        </TouchableOpacity>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TODAY</Text>
            <Text style={styles.statValue}>{formatTodayTime(todaySeconds)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>WEEKLY FOCUS</Text>
            <Text style={styles.statValue}>{formatWeeklyTime(weeklySeconds)}</Text>
          </View>
        </View>

        {/* View Stats Link */}
        <TouchableOpacity
          style={styles.statsLink}
          onPress={() => router.push('/stats')}
        >
          <Text style={styles.statsLinkIcon}>↗</Text>
          <Text style={styles.statsLinkText}>Focus Stats</Text>
        </TouchableOpacity>

        {/* Google 로그인 / 로그아웃 */}
        {!isLoggedIn ? (
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={isSigningIn}
            activeOpacity={0.8}
          >
            <Text style={styles.googleButtonText}>
              {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.accountRow}>
            {user?.name ? (
              <Text style={styles.accountName}>{user.name}</Text>
            ) : null}
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 24,
  },
  logoArea: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  logoIcon: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  startButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  startIcon: {
    color: '#FFF',
    fontSize: 16,
  },
  startText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'flex-start',
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  statsLinkIcon: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  statsLinkText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  googleButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountName: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  signOutText: {
    fontSize: 14,
    color: '#E55',
    fontWeight: '500',
  },
});
