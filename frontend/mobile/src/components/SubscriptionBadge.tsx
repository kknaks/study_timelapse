import { View, Text, StyleSheet } from 'react-native';
import { s } from '../constants/strings';

interface Props {
  daysRemaining: number;
}

export function SubscriptionBadge({ daysRemaining }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{s.trial.badge(daysRemaining)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
});
