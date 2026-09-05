import { describe, expect, it } from 'vitest';
import { decodeDiagnostics } from './client';

const view = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

describe('decodeDiagnostics', () => {
  it('decodes the firmware v2 diagnostic packet', () => {
    const packet = [
      2, 1, 2, 0, 1, 3, 1, 0,
      0x85, 0xff, 0xff, 0xff,
      0xc8, 0x01, 0x00, 0x00,
      0x60, 0xea, 0x00, 0x00,
      0x7b, 0x00, 0, 0
    ];

    expect(decodeDiagnostics(view(packet))).toEqual({
      mode: 'returning',
      lastRequest: 'home',
      odometryStale: false,
      obstacleSafetyEnabled: true,
      obstacleSafetyIntervention: 'stopped',
      frontDistanceMm: 123,
      xMm: -123,
      yMm: 456,
      headingMdeg: 60000
    });
  });

  it('keeps accepting the original v1 diagnostic packet', () => {
    const packet = [
      1, 0, 1, 1,
      0x0a, 0x00, 0x00, 0x00,
      0xec, 0xff, 0xff, 0xff,
      0x30, 0xf8, 0xff, 0xff
    ];

    expect(decodeDiagnostics(view(packet))).toEqual({
      mode: 'manual',
      lastRequest: 'drive',
      odometryStale: true,
      obstacleSafetyEnabled: false,
      obstacleSafetyIntervention: 'unknown',
      frontDistanceMm: null,
      xMm: 10,
      yMm: -20,
      headingMdeg: -2000
    });
  });

  it('rejects packets with an unsupported version or size', () => {
    expect(decodeDiagnostics(view([2, ...Array(15).fill(0)]))).toBeNull();
    expect(decodeDiagnostics(view([3, ...Array(23).fill(0)]))).toBeNull();
  });
});
