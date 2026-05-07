import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ls } from '../i18n/subscription';

interface Props {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  onTermsChange: (v: boolean) => void;
  onPrivacyChange: (v: boolean) => void;
}

export function TermsAgreementCheckbox({
  termsAgreed,
  privacyAgreed,
  onTermsChange,
  onPrivacyChange,
}: Props) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Row
        checked={termsAgreed}
        label={ls.termsLabel}
        onToggle={() => onTermsChange(!termsAgreed)}
        onView={() => router.push('/legal/terms')}
      />
      <Row
        checked={privacyAgreed}
        label={ls.privacyLabel}
        onToggle={() => onPrivacyChange(!privacyAgreed)}
        onView={() => router.push('/legal/privacy')}
      />
    </View>
  );
}

interface RowProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
  onView: () => void;
}

function Row({ checked, label, onToggle, onView }: RowProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.checkboxArea} onPress={onToggle} activeOpacity={0.7}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onView} style={styles.viewBtn}>
        <Text style={styles.viewText}>{ls.viewLink}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  checkboxArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  label: {
    fontSize: 13,
    color: '#444',
    flex: 1,
    lineHeight: 18,
  },
  viewBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  viewText: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
