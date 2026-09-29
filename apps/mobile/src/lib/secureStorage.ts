/**
 * Secure key-value storage: Android Keystore-backed SecureStore on device.
 * (The web preview build falls back to localStorage — not a production target.)
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export async function secureGet(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}
export async function secureSet(key: string, value: string): Promise<void> {
  if (web) return void globalThis.localStorage?.setItem(key, value);
  await SecureStore.setItemAsync(key, value);
}
export async function secureDelete(key: string): Promise<void> {
  if (web) return void globalThis.localStorage?.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}
