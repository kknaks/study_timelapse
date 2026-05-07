import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { BannerAlert } from '../types/subscription';
import { s } from '../i18n/subscription';

interface Props {
  bannerAlert: BannerAlert;
  onUpgrade: () => void;
}

export function TrialExpiringBanner({ bannerAlert, onUpgrade }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (!bannerAlert || dismissed) return null;

  const message =
    bannerAlert === 'trial_expiring_24h'
      ? s.trial.expiring24h
      : s.trial.expiring1h;

  return (
    <View style={styles.banner}>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgrade}>
          <Text style={styles.upgradeBtnText}>{s.trial.upgradeNow}</Text>
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
    backgroundColor: '#FFF3CD',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  message: {
    flex: 1,
    color: '#856404',
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upgradeBtn: {
    backgroundColor: '#856404',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  upgradeBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '600',
  },
});
