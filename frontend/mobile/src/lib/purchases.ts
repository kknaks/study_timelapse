import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

let _configured = false;

export function isRevenueCatConfigured(): boolean {
  return _configured;
}

export function configurePurchases(): void {
  if (Platform.OS === 'web') return;

  const apiKey =
    Platform.OS === 'ios'
      ? (process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '')
      : (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '');

  if (!apiKey) {
    console.warn('[RevenueCat] API key not configured — staging mode');
    return;
  }

  // setLogLevel is async but fire-and-forget is acceptable here
  void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  _configured = true;
}

export async function loginRevenueCat(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !_configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[RevenueCat] logIn failed:', e);
  }
}
