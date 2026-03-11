import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { loginWithGoogle } from '../src/api/auth';
import { tokenStore } from '../src/auth/tokenStore';
import { useAuth } from '../src/auth/AuthContext';
import { useState } from 'react';
import Constants from 'expo-constants';

GoogleSignin.configure({
  iosClientId: '804697996965-2nen6lpvc0pgt2vas6vbai5hl9i4ufjk.apps.googleusercontent.com',
  webClientId: '804697996965-uiu9k5epfpbkgigmcmdpbgofmi9si3ak.apps.googleusercontent.com',
  scopes: ['profile', 'email'],
});

export default function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setLoggedIn } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

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
      setLoggedIn(true);
      queryClient.invalidateQueries();
      router.replace('/');
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('Sign In Failed', error.message || 'Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
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
      </View>

      <Text style={styles.versionText}>v{appVersion}</Text>
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
    justifyContent: 'flex-start',
    paddingHorizontal: 28,
    paddingTop: '25%',
    gap: 32,
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
    color: '#888888',
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
  versionText: {
    fontSize: 12,
    color: '#AAAAAA',
    textAlign: 'center',
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
  },
});
