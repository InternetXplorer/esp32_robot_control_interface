import { crc32, validateMap } from '../ble/mapping';
export type SavedMap = {
  id: string;
  name: string;
  savedAt: string;
  bytes: Uint8Array;
};
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('robot-maps', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('maps', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveMap(bytes: Uint8Array, name: string): Promise<void> {
  validateMap(bytes);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('maps', 'readwrite');
      const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      tx.objectStore('maps').put({
        id: v.getBigUint64(8, true).toString(),
        name,
        savedAt: new Date().toISOString(),
        bytes
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function listMaps(): Promise<SavedMap[]> {
  const db = await database();
  try {
    return await new Promise<SavedMap[]>((resolve, reject) => {
      const request = db.transaction('maps').objectStore('maps').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export function exportMap(bytes: Uint8Array): string {
  validateMap(bytes);
  return JSON.stringify({
    format: 'robot-room-map',
    version: 1,
    frame: {
      x: 'forward',
      y: 'left',
      heading: 'counterclockwise',
      unit: 'millimetres',
      start: [0, 0, 0]
    },
    layers: [
      {
        kind: 'occupancy-evidence',
        encoding: 'signed-int8',
        checksum: crc32(bytes),
        data: Array.from(bytes)
      }
    ]
  });
}
export function importMap(text: string): Uint8Array {
  const file = JSON.parse(text);
  const layer = file?.layers?.[0];
  if (
    file?.format !== 'robot-room-map' ||
    file.version !== 1 ||
    file.frame?.x !== 'forward' ||
    file.frame?.y !== 'left' ||
    file.frame?.heading !== 'counterclockwise' ||
    layer?.kind !== 'occupancy-evidence' ||
    !Array.isArray(layer.data) ||
    layer.data.some(
      (v: unknown) =>
        typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255
    )
  )
    throw new Error('Invalid map file.');
  const bytes = Uint8Array.from(layer.data);
  validateMap(bytes);
  if (crc32(bytes) !== layer.checksum)
    throw new Error('Map checksum mismatch.');
  return bytes;
}
