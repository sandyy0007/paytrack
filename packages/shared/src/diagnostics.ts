import { sha256 } from './sha256';

export type ParamDiffStatus = 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'REMOVED';

export interface ParamDiffItem {
  key: string;
  inRaw: string | null;
  inLaunched: string | null;
  status: ParamDiffStatus;
}

export interface UpiDiagnosticsReport {
  timestamp: string;
  flowType: 'ZERO_ALTERATION' | 'AUGMENTED' | 'CONSTRUCTED';
  isZeroAlteration: boolean;
  rawQrPayload: string | null;
  rawQrHash: string | null;
  finalLaunchUri: string;
  finalLaunchUriHash: string;
  intentAction: string;
  intentDataUri: string;
  packageName: string | null;
  paramDiff: ParamDiffItem[];
  reconciliationStatus?: string | null;
  resultCode?: number | null;
  responseCode?: string | null;
  transactionId?: string | null;
  transactionReference?: string | null;
  approvalReference?: string | null;
  utr?: string | null;
}

/** Masks sensitive PII/VPA data for secure logging and display. */
export function maskSensitive(str: string | null | undefined): string {
  if (!str) return '';
  const trimmed = str.trim();
  // Mask VPA (e.g. user9876@okhdfcbank -> us***@okhdfcbank)
  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    const handle = parts[0] || '';
    const psp = parts[1] || '';
    if (handle.length <= 2) return `${handle[0] ?? ''}***@${psp}`;
    return `${handle.slice(0, 2)}***${handle.slice(-1)}@${psp}`;
  }
  // Mask long numbers or signatures (keep first 4 and last 4)
  if (trimmed.length > 10) {
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }
  return trimmed;
}

/** Extracts query parameters from a UPI URI string without alteration. */
export function extractQueryParamsRaw(uri: string): Record<string, string> {
  const map: Record<string, string> = {};
  const queryIndex = uri.indexOf('?');
  if (queryIndex === -1) return map;
  const queryString = uri.slice(queryIndex + 1);
  for (const part of queryString.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = (eq === -1 ? part : part.slice(0, eq)).trim();
    const val = eq === -1 ? '' : part.slice(eq + 1);
    if (key) {
      map[key] = val;
    }
  }
  return map;
}

/**
 * Produces an exhaustive parameter-by-parameter diff between raw QR and launched URI.
 * Covers all standard NPCI fields and ANY unknown/custom provider parameters.
 */
export function diffUpiParameters(rawUri: string | null, launchedUri: string): ParamDiffItem[] {
  const rawParams = rawUri ? extractQueryParamsRaw(rawUri) : {};
  const launchedParams = extractQueryParamsRaw(launchedUri);

  const allKeys = Array.from(new Set([...Object.keys(rawParams), ...Object.keys(launchedParams)]));

  // Natural sorting with standard NPCI fields first, then alphabetical for unknown fields
  const standardPriority = [
    'pa', 'pn', 'mc', 'tid', 'tr', 'mid', 'msid', 'mtid',
    'orgid', 'mode', 'purpose', 'url', 'sign', 'am', 'mam', 'cu', 'tn',
  ];

  allKeys.sort((a, b) => {
    const idxA = standardPriority.indexOf(a.toLowerCase());
    const idxB = standardPriority.indexOf(b.toLowerCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return allKeys.map((key) => {
    const inRaw = rawParams[key] ?? null;
    const inLaunched = launchedParams[key] ?? null;
    let status: ParamDiffStatus = 'UNCHANGED';

    if (inRaw === null && inLaunched !== null) {
      status = 'ADDED';
    } else if (inRaw !== null && inLaunched === null) {
      status = 'REMOVED';
    } else if (inRaw !== inLaunched) {
      status = 'MODIFIED';
    }

    return {
      key,
      inRaw,
      inLaunched,
      status,
    };
  });
}

/**
 * Builds the comprehensive forensic diagnostic report for a UPI launch.
 */
export function buildUpiDiagnostics(
  rawQrPayload: string | null | undefined,
  finalLaunchUri: string,
  extra?: {
    packageName?: string | null;
    resultCode?: number | null;
    responseCode?: string | null;
    transactionId?: string | null;
    transactionReference?: string | null;
    approvalReference?: string | null;
    utr?: string | null;
    reconciliationStatus?: string | null;
  },
): UpiDiagnosticsReport {
  const raw = rawQrPayload?.trim() || null;
  const rawHash = raw ? sha256(raw) : null;
  const launchHash = sha256(finalLaunchUri);
  const isZeroAlteration = raw !== null && rawHash === launchHash;

  let flowType: 'ZERO_ALTERATION' | 'AUGMENTED' | 'CONSTRUCTED' = 'CONSTRUCTED';
  if (raw) {
    flowType = isZeroAlteration ? 'ZERO_ALTERATION' : 'AUGMENTED';
  }

  const paramDiff = diffUpiParameters(raw, finalLaunchUri);

  return {
    timestamp: new Date().toISOString(),
    flowType,
    isZeroAlteration,
    rawQrPayload: raw ? maskSensitive(raw) : null,
    rawQrHash: rawHash,
    finalLaunchUri: maskSensitive(finalLaunchUri),
    finalLaunchUriHash: launchHash,
    intentAction: 'android.intent.action.VIEW',
    intentDataUri: maskSensitive(finalLaunchUri),
    packageName: extra?.packageName ?? null,
    paramDiff,
    reconciliationStatus: extra?.reconciliationStatus ?? null,
    resultCode: extra?.resultCode ?? null,
    responseCode: extra?.responseCode ?? null,
    transactionId: extra?.transactionId ?? null,
    transactionReference: extra?.transactionReference ?? null,
    approvalReference: extra?.approvalReference ?? null,
    utr: extra?.utr ?? null,
  };
}
