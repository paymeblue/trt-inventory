import { describe, expect, it } from 'vitest';
import {
  extractBarcodeFromPayload,
  extractScanDeepLink,
} from '@/lib/scan-deep-link';

/**
 * These tests cover the logic that decides whether a scanned payload is a
 * deep-link (open URL → auto-complete) or a plain barcode (send to the
 * order's manual /scan API). Getting this right is load-bearing: a
 * mis-classification either breaks existing USB scanners or skips the
 * auto-complete happy path that the QR stickers enable.
 */
describe('extractScanDeepLink', () => {
  it('returns the path for an absolute https URL', () => {
    expect(extractScanDeepLink('https://app.example.com/s/TRT-ABC')).toBe(
      '/s/TRT-ABC',
    );
  });

  it('returns the path for an absolute http URL', () => {
    expect(extractScanDeepLink('http://localhost:3000/s/TRT-XYZ')).toBe(
      '/s/TRT-XYZ',
    );
  });

  it('preserves the query string so future deep links can carry context', () => {
    expect(
      extractScanDeepLink('https://app.example.com/s/TRT-ABC?ref=sticker'),
    ).toBe('/s/TRT-ABC?ref=sticker');
  });

  it('accepts relative /s/<barcode> paths too', () => {
    expect(extractScanDeepLink('/s/TRT-REL')).toBe('/s/TRT-REL');
  });

  it('returns null for a bare barcode string (USB scanner path)', () => {
    expect(extractScanDeepLink('TRT-ABC123DEF456')).toBeNull();
  });

  it("returns null for an unrelated URL (e.g. another site's QR)", () => {
    expect(extractScanDeepLink('https://evil.example.com/x')).toBeNull();
  });

  it('returns null for empty / whitespace payloads', () => {
    expect(extractScanDeepLink('')).toBeNull();
    expect(extractScanDeepLink('   ')).toBeNull();
  });

  it('trims leading/trailing whitespace before classifying', () => {
    expect(extractScanDeepLink('  https://app.example.com/s/TRT-A  ')).toBe(
      '/s/TRT-A',
    );
    expect(extractScanDeepLink('  TRT-BARE  ')).toBeNull();
  });

  it('does not confuse /s paths with /settings or /search', () => {
    expect(extractScanDeepLink('https://app.example.com/settings')).toBeNull();
    expect(
      extractScanDeepLink('https://app.example.com/search/s/foo'),
    ).toBeNull();
    expect(extractScanDeepLink('/settings')).toBeNull();
  });

  it('ignores URLs with different prefix even if they contain /s/', () => {
    expect(
      extractScanDeepLink('https://app.example.com/x/s/TRT-ABC'),
    ).toBeNull();
  });
});

/**
 * `extractBarcodeFromPayload` is what the in-app `ScanInput` runs on every
 * read so the rapid-scan loop on the order detail page works regardless of
 * whether the operator's scanner read the QR (URL) or the CODE128 strip
 * (which now also encodes the URL so 3rd-party phone scanners get a
 * tappable link).
 */
describe('extractBarcodeFromPayload', () => {
  it('unwraps an absolute https deep-link URL to the bare barcode', () => {
    expect(
      extractBarcodeFromPayload('https://app.example.com/s/TRT-ABC123DEF456'),
    ).toBe('TRT-ABC123DEF456');
  });

  it('unwraps a relative /s/<barcode> path', () => {
    expect(extractBarcodeFromPayload('/s/TRT-REL12345')).toBe('TRT-REL12345');
  });

  it('strips the query string when unwrapping', () => {
    expect(
      extractBarcodeFromPayload('https://x.test/s/TRT-Q?ref=sticker'),
    ).toBe('TRT-Q');
  });

  it('decodes percent-encoded barcodes', () => {
    // an installer's scanner could in theory emit the URL-encoded form
    expect(extractBarcodeFromPayload('/s/TRT%2DABC')).toBe('TRT-ABC');
  });

  it('returns the bare barcode untouched (USB scanner / manual entry)', () => {
    expect(extractBarcodeFromPayload('TRT-ABC123DEF456')).toBe(
      'TRT-ABC123DEF456',
    );
  });

  it('trims surrounding whitespace from any payload', () => {
    expect(extractBarcodeFromPayload('  TRT-WHITE  ')).toBe('TRT-WHITE');
    expect(extractBarcodeFromPayload('  https://x.test/s/TRT-ABC  ')).toBe(
      'TRT-ABC',
    );
  });

  it('returns empty string for empty / whitespace input', () => {
    expect(extractBarcodeFromPayload('')).toBe('');
    expect(extractBarcodeFromPayload('   ')).toBe('');
  });

  it('passes through unrelated text unchanged so the API can reject it', () => {
    expect(extractBarcodeFromPayload('https://evil.example.com/x')).toBe(
      'https://evil.example.com/x',
    );
    expect(extractBarcodeFromPayload('not a barcode')).toBe('not a barcode');
  });
});
