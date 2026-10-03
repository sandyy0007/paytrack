import * as ImagePicker from 'expo-image-picker';
import { scanFromURLAsync } from 'expo-camera';
import { parseUpiQr, type UpiPayload } from '@paytrack/shared';

export type GalleryQrResult =
  | { ok: true; payload: UpiPayload; raw: string }
  | { ok: false; error: string; canceled?: boolean; raw?: string };

/**
 * Opens image gallery, extracts QR barcode, and parses UPI payload.
 */
export async function scanQrFromGallery(): Promise<GalleryQrResult> {
  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return { ok: false, error: 'Image selection was canceled', canceled: true };
    }

    const uri = res.assets[0]?.uri;
    if (!uri) {
      return { ok: false, error: 'No image URI returned' };
    }

    const barcodes = await scanFromURLAsync(uri, ['qr']);
    if (!barcodes || barcodes.length === 0 || !barcodes[0]?.data) {
      return { ok: false, error: 'No valid QR code was detected in the selected image.' };
    }

    const raw = barcodes[0].data;
    const parsed = parseUpiQr(raw);
    if (!parsed.ok) {
      return { ok: false, error: parsed.message, raw };
    }

    return { ok: true, payload: parsed.payload, raw };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to scan image: ${msg}` };
  }
}

