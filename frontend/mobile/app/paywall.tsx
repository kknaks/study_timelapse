import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

type FeatureRow = {
  label: string;
  free: string;
  pro: string;
};

const FEATURES: FeatureRow[] = [
  { label: 'Daily Sessions',    free: '3 / day',    pro: 'Unlimited' },
  { label: 'Watermark',         free: 'Always on',  pro: 'Remove' },
  { label: 'Export Resolution', free: '720p',        pro: '1080p' },
  { label: 'Overlay Styles',    free: 'All',         pro: 'All + more' },
  { label: 'Streak Backup',     free: '—',           pro: 'Cloud sync' },
  { label: 'Priority Support',  free: '—',           pro: 'Included' },
];

export default function PaywallScreen() {
  const router = useRouter();

  const handleSubscribe = () => {
    // TODO: RevenueCat 연동 시 구현
    console.log('Subscribe tapped — coming soon');
  };

  const handleRestore = () => {
    // TODO: RevenueCat 연동 시 구현
    console.log('Restore tapped — coming soon');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>FOCUSTIMELAPSE</Text>
          <Text style={styles.heroTitle}>Go Pro</Text>
          <Text style={styles.heroSubtitle}>
            Unlock the full experience.{'\n'}No limits. No watermark.
          </Text>
        </View>

        {/* Feature Table */}
        <View style={styles.table}>
          {/* Column headers */}
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

          {/* Divider */}
          <View style={styles.divider} />

          {/* Rows */}
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

        {/* Pricing */}
        <View style={styles.pricingRow}>
          <View style={styles.pricingCard}>
            <Text style={styles.pricingPeriod}>Monthly</Text>
            <Text style={styles.pricingPrice}>$2.99</Text>
            <Text style={styles.pricingNote}>/ month</Text>
          </View>
          <View style={[styles.pricingCard, styles.pricingCardHighlight]}>
            <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>BEST VALUE</Text></View>
            <Text style={[styles.pricingPeriod, { color: '#FFF' }]}>Yearly</Text>
            <Text style={[styles.pricingPrice, { color: '#FFF' }]}>$19.99</Text>
            <Text style={[styles.pricingNote, { color: 'rgba(255,255,255,0.6)' }]}>/ year</Text>
          </View>
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaButton} onPress={handleSubscribe}>
          <Text style={styles.ctaText}>Start Free Trial</Text>
        </TouchableOpacity>
        <Text style={styles.trialNote}>7-day free trial · Cancel anytime</Text>

        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
          <Text style={styles.restoreText}>Restore Purchase</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Subscription auto-renews. Cancel at any time in App Store settings.
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

  scroll: { paddingHorizontal: 24, paddingBottom: 48 },

  // Hero
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

  // Table
  table: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#252525',
    marginBottom: 24,
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

  // Pricing
  pricingRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  pricingCard: {
    flex: 1,
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 4,
  },
  pricingCardHighlight: { backgroundColor: '#FFF', position: 'relative' },
  saveBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  saveBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  pricingPeriod: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500', marginTop: 8 },
  pricingPrice: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  pricingNote: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  // CTA
  ctaButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaText: { color: '#1a1a1a', fontSize: 16, fontWeight: '700' },
  trialNote: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginBottom: 20 },

  restoreButton: { alignItems: 'center', paddingVertical: 8, marginBottom: 24 },
  restoreText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  legalText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
