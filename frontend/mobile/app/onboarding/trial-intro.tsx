import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { s } from '../../src/constants/strings';

export default function OnboardingTrialIntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerArea}>
          <Text style={styles.title}>{s.trialIntro.title}</Text>
          <Text style={styles.subtitle}>{s.trialIntro.subtitle}</Text>
        </View>

        <View style={styles.infoBox}>
          {s.trialIntro.bullets.map((item, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{'•'}</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
          <View style={styles.legalRow}>
            <Text style={styles.legalNote}>{s.trialIntro.legalKo}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/paywall?source=onboarding')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>{s.trialIntro.ctaStart}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>{s.trialIntro.ctaLater}</Text>
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
    gap: 28,
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
  infoBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#333333',
    lineHeight: 22,
  },
  legalRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10,
  },
  legalNote: {
    fontSize: 11,
    color: '#AAAAAA',
    lineHeight: 16,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#888888',
  },
});
