/**
 * One-shot clipboard check after returning from the UPI app. Never polls,
 * never uploads; only looks for a 12-digit UTR and the user must confirm.
 */
import * as Clipboard from 'expo-clipboard';
import { extractUtrCandidates } from '@paytrack/shared';

export async function suggestUtrFromClipboard(): Promise<string | null> {
  try {
    if (!(await Clipboard.hasStringAsync())) return null;
    const text = await Clipboard.getStringAsync();
    return extractUtrCandidates(text)[0] ?? null;
  } catch {
    return null;
  }
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
