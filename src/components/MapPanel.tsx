import { useEffect, useRef, useState } from 'react';
import { WebBleMotorClient } from '../ble/client';
import { MAP_HEADER, MapStatus } from '../ble/mapping';
import {
  exportMap,
  importMap,
  listMaps,
  saveMap,
  SavedMap
} from '../domain/mapStorage';
import styles from './MapPanel.module.css';

export function MapPanel({
  client,
  connected,
  beforeStart,
  onStop
}: {
  client: WebBleMotorClient;
  connected: boolean;
  beforeStart: () => void;
  onStop: () => Promise<void>;
}) {
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
  const [geometry, setGeometry] = useState<{
    target: [number, number] | null;
    extents: number[];
    reason: string;
  }>({ target: null, extents: [120, 100, 90, 90], reason: '' });
  const live = useRef<{
    map: Uint8Array | null;
    revision: number;
    cursor: number;
    passRevision: number;
  }>({ map: null, revision: 0, cursor: 0, passRevision: 0 });
  const complete = useRef<Uint8Array | null>(null);
  const showLive = useRef(true);
  useEffect(() => {
    if (connected)
      live.current = { map: null, revision: 0, cursor: 0, passRevision: 0 };
  }, [connected]);
  const displayComplete = (bytes: Uint8Array) => {
    complete.current = bytes;
    setMap(bytes);
  };
  const refreshSaved = () => listMaps().then(setSaved);
  useEffect(() => {
    void refreshSaved().catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!connected || !client.mapping.available) return;
    let cancelled = false,
      polling = false;
    const poll = async () => {
      if (polling || client.mapping.busy || busy || document.hidden) return;
      polling = true;
      try {
        const next = await client.mapping.status();
        if (!cancelled) {
          setStatus(next);
          client.explorationConfirmed = next.active;
          setUpdated(Date.now());
          setGeometry(await client.mapping.geometry());
          if (!live.current.map && next.aligned) {
            const snapshot = await client.mapping.snapshot(setProgress);
            const revision = new DataView(snapshot.buffer).getUint32(16, true);
            live.current = {
              map: snapshot,
              revision,
              cursor: 0,
              passRevision: revision
            };
            if (showLive.current) displayComplete(snapshot);
          } else if (
            live.current.map &&
            next.revision !== live.current.revision
          ) {
            if (live.current.cursor === 0)
              live.current.passRevision = next.revision;
            const update = await client.mapping.refreshTile(
              live.current.map,
              live.current.revision,
              live.current.cursor
            );
            live.current.map = update.map;
            live.current.cursor = update.cursor;
            if (update.cursor === 0)
              live.current.revision = live.current.passRevision;
            if (showLive.current) setMap(update.map);
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connected, client, busy]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(200, 200);
    const evidence = map
      ? new Int8Array(map.buffer, map.byteOffset + MAP_HEADER, 40000)
      : null;
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++) {
        const value = evidence?.[y * 200 + x] ?? 0;
        const color =
          value >= 3
            ? [240, 121, 89]
            : value <= -2
              ? [210, 227, 218]
              : [43, 53, 66];
        const p = ((199 - y) * 200 + x) * 4;
        image.data.set([...color, 255], p);
      }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = '#64d8ff';
    ctx.beginPath();
    ctx.moveTo(97, 100);
    ctx.lineTo(103, 100);
    ctx.moveTo(100, 97);
    ctx.lineTo(100, 103);
    ctx.stroke();
    if (status) {
      ctx.save();
      ctx.translate(100 + status.x / 100, 100 - status.y / 100);
      ctx.rotate((-status.heading * Math.PI) / 180);
      ctx.strokeStyle = '#ffe173';
      ctx.lineWidth = 1;
      const [front, rear, left, right] = geometry.extents;
      ctx.strokeRect(
        -rear / 100,
        -left / 100,
        (front + rear) / 100,
        (left + right) / 100
      );
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      ctx.restore();
      if (geometry.target) {
        ctx.strokeStyle = '#b49bff';
        ctx.strokeRect(
          98 + geometry.target[0] / 100,
          98 - geometry.target[1] / 100,
          4,
          4
        );
      }
    }
  }, [map, status, geometry]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const snapshotForSave = async () => {
    const snapshot =
      connected && showLive.current
        ? await client.mapping.snapshot(setProgress)
        : complete.current;
    if (!snapshot) throw new Error('Obtain a complete snapshot before saving.');
    complete.current = snapshot;
    return snapshot;
  };
  const download = async () => {
    const snapshot = await snapshotForSave();
    const url = URL.createObjectURL(
      new Blob([exportMap(snapshot)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'room-map.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const disabled =
    !connected || !client.mapping.available || busy || client.mapping.busy;
  return (
    <section className={styles.panel} aria-label="Room exploration">
      <h2>Room exploration</h2>
      <p>
        Odometry-based · 20 × 20 m · 10 cm cells. Unknown regions remain
        unresolved.
      </p>
      <p role="status">
        {!connected
          ? 'Disconnected — display is stale'
          : status
            ? `${status.phase}${Date.now() - updated > 5000 ? ' — stale' : ''}`
            : 'Waiting for mapping firmware'}
      </p>
      {geometry.reason && <p>{geometry.reason}</p>}
      <canvas
        className={styles.map}
        ref={canvas}
        width={200}
        height={200}
        aria-label="Occupancy map, positive X right and positive Y up"
      />
      <p>
        Light: free · coral: obstacle · dark: unknown. Blue cross: marked start,
        facing right. Width: 20 m.
      </p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        The robot is at the marked starting position and heading, with clear
        space to turn.
      </label>
      <div className={styles.actions}>
        <button
          disabled={disabled || !confirmed}
          onClick={() =>
            void action(async () => {
              beforeStart();
              await client.explore();
              showLive.current = true;
              live.current.map = null;
              setConfirmed(false);
            })
          }
        >
          New exploration
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void action(async () => {
              await client.mapping.command(2);
              client.explorationConfirmed = false;
            })
          }
        >
          Pause
        </button>
        <button
          disabled={disabled || !status?.aligned}
          onClick={() =>
            void action(async () => {
              beforeStart();
              await client.explore(true);
            })
          }
        >
          Resume
        </button>
        <button disabled={!connected} onClick={() => void onStop()}>
          Stop
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void action(async () => {
              showLive.current = true;
              displayComplete(await client.mapping.snapshot(setProgress));
            })
          }
        >
          Refresh complete map
        </button>
      </div>
      {(busy || client.mapping.busy) && (
        <progress value={progress} max={1} aria-label="Map transfer progress" />
      )}
      <div className={styles.actions}>
        <button
          disabled={!map || busy || client.mapping.busy}
          onClick={() =>
            void action(async () => {
              await saveMap(
                await snapshotForSave(),
                `Room ${new Date().toLocaleString()}`
              );
              await refreshSaved();
            })
          }
        >
          Save on phone
        </button>
        <button
          disabled={!map || busy || client.mapping.busy}
          onClick={() => void action(download)}
        >
          Export file
        </button>
        <label>
          Import file{' '}
          <input
            type="file"
            accept=".json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void action(async () => {
                  if (file.size > 500000)
                    throw new Error('Map file is too large.');
                  const imported = importMap(await file.text());
                  showLive.current = false;
                  displayComplete(imported);
                  setConfirmed(false);
                });
            }}
          />
        </label>
        <select
          value={selected}
          aria-label="Saved map"
          onChange={(e) => {
            setSelected(e.target.value);
            const savedMap = saved.find((m) => m.id === e.target.value)?.bytes;
            if (savedMap) {
              showLive.current = false;
              displayComplete(savedMap);
            }
            setConfirmed(false);
          }}
        >
          <option value="">Select a saved map</option>
          {saved.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          disabled={
            disabled || !complete.current || !confirmed || status?.active
          }
          onClick={() =>
            void action(async () => {
              if (complete.current) {
                await onStop();
                await client.mapping.restore(complete.current, setProgress);
                live.current.map = null;
                showLive.current = true;
                setConfirmed(false);
              }
            })
          }
        >
          Restore at marked start
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
