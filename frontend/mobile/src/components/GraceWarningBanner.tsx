import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';

interface Props {
  expiresAt: string;
  onUpdatePaymentMethod?: () => void;
}

function formatGraceDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function defaultOpenPaymentSettings() {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
  void Linking.openURL(url);
}

export function GraceWarningBanner({ expiresAt, onUpdatePaymentMethod }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleUpdate = onUpdatePaymentMethod ?? defaultOpenPaymentSettings;

  return (
    <View style={styles.banner}>
      <Text style={styles.message}>
        {'Payment method needs attention. Update by '}
        <Text style={styles.dateText}>{formatGraceDate(expiresAt)}</Text>
        {' to keep your subscription active.'}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.updateBtn} onPress={handleUpdate}>
          <Text style={styles.updateBtnText}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dismissBtn} onPress={() => setDismissed(true)}>
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFE4E1',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  message: {
    color: '#8B0000',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  dateText: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateBtn: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  updateBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    color: '#8B0000',
    fontSize: 14,
    fontWeight: '600',
  },
});
