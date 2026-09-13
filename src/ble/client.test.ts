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
      frontSensorFault: false,
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
      frontSensorFault: false,
      xMm: 10,
      yMm: -20,
      headingMdeg: -2000
    });
  });

  it('decodes the firmware v3 diagnostic packet and its new fields', () => {
    const packet = [
      3, 0, 6, 0, 1, 4, 0, 1,
      0x64, 0x00, 0x00, 0x00,
      0x38, 0xff, 0xff, 0xff,
      0x28, 0x23, 0x00, 0x00,
      0xff, 0xff, 0, 0
    ];

    expect(decodeDiagnostics(view(packet))).toEqual({
      mode: 'manual',
      lastRequest: 'move-until-obstacle',
      odometryStale: false,
      obstacleSafetyEnabled: true,
      obstacleSafetyIntervention: 'sensor-fault',
      frontDistanceMm: null,
      frontSensorFault: true,
      xMm: 100,
      yMm: -200,
      headingMdeg: 9000
    });
  });

  it('accepts additive revisions that preserve the v2 diagnostic prefix', () => {
    const packet = [3, 0, 4, 0, 0, 0, 0, 0, ...Array(16).fill(0), 99, 100];
    packet[0] = 4;

    expect(decodeDiagnostics(view(packet))).toMatchObject({
      lastRequest: 'safety-off',
      frontSensorFault: false
    });
  });

  it('rejects packets with an unsupported version or truncated prefix', () => {
    expect(decodeDiagnostics(view([0, ...Array(23).fill(0)]))).toBeNull();
    expect(decodeDiagnostics(view([2, ...Array(15).fill(0)]))).toBeNull();
    expect(decodeDiagnostics(view([3, ...Array(22).fill(0)]))).toBeNull();
  });
});
