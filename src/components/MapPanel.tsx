import { useEffect, useRef, useState } from 'react';
import { WebBleMotorClient } from '../ble/client';
import { MAP_HEADER, MapStatus } from '../ble/mapping';
import { exportMap, importMap, listMaps, saveMap, SavedMap } from '../domain/mapStorage';
import styles from './MapPanel.module.css';

export function MapPanel({ client, connected, beforeStart, onStop }: { client: WebBleMotorClient; connected: boolean; beforeStart: () => void; onStop: () => Promise<void> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [map, setMap] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [saved, setSaved] = useState<SavedMap[]>([]);
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(0);
  const refreshSaved = () => listMaps().then(setSaved);
  useEffect(() => { void refreshSaved().catch(e => setError(String(e))); }, []);
  useEffect(() => {
    if (!connected || !client.mapping.available) return;
    let cancelled = false, polling = false;
    const poll = async () => {
      if (polling || client.mapping.busy || busy || document.hidden) return;
      polling = true;
      try { const next = await client.mapping.status(); if (!cancelled) { setStatus(next); client.explorationConfirmed = next.active; setUpdated(Date.now()); } }
      catch (e) { if (!cancelled) setError(String(e)); }
      finally { polling = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connected, client, busy]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    const image = ctx.createImageData(200, 200);
    const evidence = map ? new Int8Array(map.buffer, map.byteOffset + MAP_HEADER, 40000) : null;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const value = evidence?.[y * 200 + x] ?? 0;
      const color = value >= 3 ? [240, 121, 89] : value <= -2 ? [210, 227, 218] : [43, 53, 66];
      const p = ((199 - y) * 200 + x) * 4; image.data.set([...color, 255], p);
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = '#64d8ff'; ctx.beginPath(); ctx.moveTo(97, 100); ctx.lineTo(103, 100); ctx.moveTo(100, 97); ctx.lineTo(100, 103); ctx.stroke();
    if (status) {
      ctx.save(); ctx.translate(100 + status.x / 100, 100 - status.y / 100); ctx.rotate(-status.heading * Math.PI / 180);
      ctx.strokeStyle = '#ffe173'; ctx.lineWidth = 1;
      ctx.strokeRect(-1, -0.9, 2.2, 1.8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5, 0); ctx.stroke(); ctx.restore();
    }
  }, [map, status]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setProgress(0);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const download = () => {
    if (!map) return;
    const url = URL.createObjectURL(new Blob([exportMap(map)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'room-map.json'; a.click(); URL.revokeObjectURL(url);
  };
  const disabled = !connected || !client.mapping.available || busy;
  return <section className={styles.panel} aria-label="Room exploration">
    <h2>Room exploration</h2>
    <p>Odometry-based · 20 × 20 m · 10 cm cells. Unknown regions remain unresolved.</p>
    <p role="status">{!connected ? 'Disconnected — display is stale' : status ? `${status.phase}${Date.now() - updated > 5000 ? ' — stale' : ''}` : 'Waiting for mapping firmware'}</p>
    <canvas className={styles.map} ref={canvas} width={200} height={200} aria-label="Occupancy map, positive X right and positive Y up" />
    <p>Light: free · coral: obstacle · dark: unknown. Blue cross: marked start, facing right. Width: 20 m.</p>
    <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
      The robot is at the marked starting position and heading, with clear space to turn.</label>
    <div className={styles.actions}>
      <button disabled={disabled || !confirmed} onClick={() => void action(async () => { beforeStart(); await client.explore(); })}>New exploration</button>
      <button disabled={disabled} onClick={() => void action(async () => { await client.mapping.command(2); client.explorationConfirmed = false; })}>Pause</button>
      <button disabled={disabled || !status?.aligned} onClick={() => void action(async () => { beforeStart(); await client.explore(true); })}>Resume</button>
      <button disabled={!connected} onClick={() => void onStop()}>Stop</button>
      <button disabled={disabled} onClick={() => void action(async () => { setMap(await client.mapping.snapshot(setProgress)); })}>Refresh complete map</button>
    </div>
    {busy && <progress value={progress} max={1} aria-label="Map transfer progress" />}
    <div className={styles.actions}>
      <button disabled={!map || busy} onClick={() => void action(async () => { if (map) { await saveMap(map, `Room ${new Date().toLocaleString()}`); await refreshSaved(); } })}>Save on phone</button>
      <button disabled={!map || busy} onClick={download}>Export file</button>
      <label>Import file <input type="file" accept=".json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void action(async () => { if (file.size > 500000) throw new Error('Map file is too large.'); setMap(importMap(await file.text())); setConfirmed(false); }); }} /></label>
      <select value={selected} aria-label="Saved map" onChange={e => { setSelected(e.target.value); setMap(saved.find(m => m.id === e.target.value)?.bytes ?? null); setConfirmed(false); }}>
        <option value="">Select a saved map</option>{saved.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button disabled={disabled || !map || !confirmed || status?.active} onClick={() => void action(async () => { if (map) { await onStop(); await client.mapping.restore(map, setProgress); } })}>Restore at marked start</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
