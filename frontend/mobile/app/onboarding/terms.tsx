import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { TermsAgreementCheckbox } from '../../src/components/TermsAgreementCheckbox';
import { agreeToTerms } from '../../src/api/user';
import { useState, useEffect } from 'react';

export default function OnboardingTermsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canProceed = termsAgreed && privacyAgreed;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const handleAgree = async () => {
    if (!canProceed) return;
    try {
      setIsSubmitting(true);
      await agreeToTerms();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.error_code || e?.response?.data?.detail || e?.message || 'Unknown';
      console.error('[onboarding] agreeToTerms failed:', status, e?.response?.data, e?.message);
      Alert.alert('Error', `[${status ?? '???'}] ${detail}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerArea}>
          <Text style={styles.title}>Welcome to FocusTimelapse</Text>
          <Text style={styles.subtitle}>
            Please agree to the following to get started.
          </Text>
        </View>

        <TermsAgreementCheckbox
          termsAgreed={termsAgreed}
          privacyAgreed={privacyAgreed}
          onTermsChange={setTermsAgreed}
          onPrivacyChange={setPrivacyAgreed}
        />

        <TouchableOpacity
          style={[styles.button, !canProceed && styles.buttonDisabled]}
          onPress={handleAgree}
          disabled={isSubmitting || !canProceed}
          activeOpacity={0.8}
        >
          <Text style={[styles.buttonText, !canProceed && styles.buttonTextDisabled]}>
            {isSubmitting ? 'Saving...' : 'Agree and Get Started'}
          </Text>
        </TouchableOpacity>
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
    gap: 32,
  },
  headerArea: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  buttonTextDisabled: {
    color: '#FFF',
  },
});
