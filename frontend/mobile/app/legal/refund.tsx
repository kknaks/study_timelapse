import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { refundPolicy } from '../../src/legal/contents';
import { ls } from '../../src/constants/strings';

export default function RefundScreen() {
  const router = useRouter();
  const doc = refundPolicy;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{ls.refundScreenTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.draftBanner}>
        <Text style={styles.draftText}>{ls.draftBanner}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.docTitle}>{doc.title}</Text>
        <Text style={styles.meta}>버전: {doc.version}</Text>
        <Text style={styles.meta}>시행일: {doc.effectiveDate}</Text>

        {doc.sections.map((sec) => (
          <View key={sec.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{sec.heading}</Text>
            <Text style={styles.sectionBody}>{sec.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: '#1a1a1a' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  draftBanner: {
    backgroundColor: '#FFF3CD',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  draftText: { color: '#856404', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48, gap: 20 },
  docTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  meta: { fontSize: 12, color: '#888', lineHeight: 18 },
  section: { gap: 8 },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  sectionBody: { fontSize: 14, color: '#444', lineHeight: 22 },
});
