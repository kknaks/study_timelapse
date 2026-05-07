import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../src/auth/AuthContext';
import { mockPurchase } from '../src/api/subscription';
import { useSubscription } from '../src/hooks/useSubscription';
import { s } from '../src/constants/strings';
import axios from 'axios';

type FeatureRow = { label: string; free: string; pro: string };

const FEATURES: FeatureRow[] = [
  { label: '일일 횟수',      free: s.paywall.featureDaily_free,       pro: s.paywall.featureDaily_pro },
  { label: '워터마크',        free: s.paywall.featureWatermark_free,   pro: s.paywall.featureWatermark_pro },
  { label: '프로그레스바',    free: s.paywall.featureProgressBar_free, pro: s.paywall.featureProgressBar_pro },
  { label: '가격',            free: s.paywall.featurePrice_free,       pro: s.paywall.featurePrice_pro },
];

export default function PaywallScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoggedIn } = useAuth();
  const { user } = useSubscription();
  const [loading, setLoading] = useState(false);

  // 가입 시 무조건 동의 방식 채택 — 이미 동의한 사용자는 재노출 불필요.
  // terms_agreed_at 이 null 인 경우(비정상 케이스): /legal/terms 로 redirect 처리는
  // backend 의 402/403 TERMS_NOT_AGREED 응답에서 catch.
  const termsAlreadyAgreed = !!user?.terms_agreed_at;

  // adr-13: 미인증 사용자는 로그인 화면으로 redirect
  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.heroTitle}>{s.paywall.loginRequired}</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.ctaText}>로그인</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await mockPurchase('monthly');
      const data = res.data?.data ?? (res.data as unknown as { success: boolean; idempotent: boolean });
      await queryClient.invalidateQueries({ queryKey: ['me'] });

      if (data.idempotent) {
        Alert.alert('', s.paywall.alreadySubscribed, [
          { text: '확인', onPress: () => router.replace('/') },
        ]);
      } else {
        Alert.alert('', s.paywall.subscribed, [
          { text: '확인', onPress: () => router.replace('/') },
        ]);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const code = err.response?.data?.error_code ?? err.response?.data?.detail;

        if ((status === 402 || status === 403) && code === 'TERMS_NOT_AGREED') {
          // T-010 약관 화면으로 redirect (화면 준비 전까지 alert fallback)
          Alert.alert('약관 동의 필요', s.paywall.termsNotAgreed, [
            { text: '확인', onPress: () => router.push('/terms') },
          ]);
          return;
        }
        if (status === 400 && code === 'INVALID_PLAN') {
          Alert.alert('', s.paywall.invalidPlan);
          return;
        }
      }
      Alert.alert('오류', '구독 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>FOCUSTIMELAPSE</Text>
          <Text style={styles.heroTitle}>{s.paywall.title}</Text>
          <Text style={styles.heroSubtitle}>{s.paywall.subtitle}</Text>
        </View>

        {/* Feature Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.featureCol} />
            <View style={styles.planCol}>
              <Text style={styles.planHeaderFree}>Free</Text>
            </View>
            <View style={styles.planCol}>
              <View style={styles.proBadge}>
                <Text style={styles.planHeaderPro}>Pro</Text>
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          {FEATURES.map((f, i) => (
            <View key={f.label} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <View style={styles.featureCol}>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
              <View style={styles.planCol}>
                <Text style={styles.freeValue}>{f.free}</Text>
              </View>
              <View style={styles.planCol}>
                <Text style={styles.proValue}>{f.pro}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Trial note */}
        <Text style={styles.trialNote}>{s.paywall.featureTrial}</Text>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#1a1a1a" />
          ) : (
            <Text style={styles.ctaText}>{s.paywall.ctaSubscribe}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legalText}>
          구독은 언제든지 취소 가능합니다. 실제 결제는 Apple/Google 스토어 연동 후 적용됩니다.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },

  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { color: 'rgba(255,255,255,0.5)', fontSize: 18 },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },

  scroll: { paddingHorizontal: 24, paddingBottom: 48 },

  hero: { alignItems: 'center', paddingVertical: 32 },
  heroLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: { color: '#FFF', fontSize: 40, fontWeight: '800', marginBottom: 12 },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  table: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#252525',
    marginBottom: 20,
  },
  tableHeader: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16 },
  featureCol: { flex: 2 },
  planCol: { flex: 1, alignItems: 'center' },
  planHeaderFree: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  proBadge: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planHeaderPro: { color: '#1a1a1a', fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  tableRow: { flexDirection: 'row', paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  featureLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  freeValue: { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center' },
  proValue: { color: '#FFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  trialNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },

  ctaButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  ctaButtonDisabled: { opacity: 0.6 },
  ctaText: { color: '#1a1a1a', fontSize: 16, fontWeight: '700' },

  legalText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
