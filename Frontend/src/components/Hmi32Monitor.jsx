import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { apiUrl, getSocketUrl } from '../api';

const SOCKET_URL = getSocketUrl();

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtDuration = (sec) => {
  if (!sec || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const StatusBadge = ({ value, label }) => {
  const on = value === 1 || value === true;
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded bg-gray-50 border border-gray-100">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${on ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
        {on ? 'ON' : 'OFF'}
      </span>
    </div>
  );
};

const KVRow = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5 px-3 rounded bg-gray-50 border border-gray-100">
    <span className="text-xs text-gray-600">{label}</span>
    <span className="text-xs font-medium text-gray-800">{String(value ?? '-')}</span>
  </div>
);

const Section = ({ title, accent = 'indigo', children }) => {
  const colors = {
    indigo: 'border-indigo-400 text-indigo-700 bg-indigo-50',
    green:  'border-green-400  text-green-700  bg-green-50',
    yellow: 'border-yellow-400 text-yellow-700 bg-yellow-50',
    purple: 'border-purple-400 text-purple-700 bg-purple-50',
    blue:   'border-blue-400   text-blue-700   bg-blue-50',
  };
  return (
    <div className="mb-4">
      <div className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-t border-l-4 ${colors[accent]}`}>
        {title}
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b p-3 space-y-1.5">
        {children}
      </div>
    </div>
  );
};

// ── MachineCard ───────────────────────────────────────────────────────────────
const MachineCard = ({ row }) => {
  // Support both structures:
  //   socket-live:  row.state = full machine:state payload { states, adc, distance, runtime }
  //   DB-imported:  row.state = { machineId, litter, sweeping, adc:{}, distance:{} }
  //                 row.runtime = { suctionSec, suctionHours, daily:[] }
  const rawState  = row.state || {};
  const states    = rawState.states    || rawState;          // live has .states, imported has flat
  const adc       = rawState.adc       || states.adc       || {};
  const distance  = rawState.distance  || states.distance  || {};
  const runtime   = rawState.runtime   || row.runtime       || {};
  const a25       = row.a25            || {};
  const canCmd    = row.canCmd         || {};
  const canGpio   = row.canGpio        || {};

  const stateKeys = Object.keys(states).filter(
    (k) => !['machineId','tsEpoch','adc','distance','runtime','buttonColors'].includes(k)
  );

  const updatedAt = row.updated_at
    ? new Date(row.updated_at).toLocaleString()
    : '-';

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-indigo-600 px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-indigo-200">Machine ID</p>
          <p className="text-white font-bold text-sm">{row.machineId || '-'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-indigo-200">Last Updated</p>
          <p className="text-white text-xs">{updatedAt}</p>
        </div>
      </div>

      <div className="p-4">

        {/* ── Machine States ── */}
        {stateKeys.length > 0 && (
          <Section title="Machine States" accent="indigo">
            {stateKeys.map((k) => {
              const v = states[k];
              return (typeof v === 'boolean' || v === 0 || v === 1)
                ? <StatusBadge key={k} label={k} value={v} />
                : <KVRow key={k} label={k} value={v} />;
            })}
          </Section>
        )}

        {/* ── ADC ── */}
        {(adc.suction != null || adc.pa0 != null) && (
          <Section title="ADC Sensors" accent="blue">
            {adc.suction != null && <KVRow label="Suction ADC" value={adc.suction} />}
            {adc.pa0     != null && <KVRow label="PA0 ADC"     value={adc.pa0}     />}
          </Section>
        )}

        {/* ── Distance ── */}
        {(distance.cm != null || distance.a25Cm != null) && (
          <Section title="Distance" accent="green">
            {distance.cm     != null && <KVRow label="Distance (cm)"  value={distance.cm}       />}
            {distance.a25Cm  != null && <KVRow label="A25 (cm)"       value={distance.a25Cm}    />}
            {distance.a25Status     && <KVRow label="A25 Status"      value={distance.a25Status}/>}
          </Section>
        )}

        {/* ── A25 Sensor (live socket) ── */}
        {Object.keys(a25).length > 0 && (
          <Section title="A25 Sensor" accent="green">
            {Object.entries(a25)
              .filter(([k]) => !['machineId','tsEpoch'].includes(k))
              .map(([k, v]) => <KVRow key={k} label={k} value={v} />)}
          </Section>
        )}

        {/* ── CAN Commands ── */}
        {Object.keys(canCmd).length > 0 && (
          <Section title="CAN Commands" accent="yellow">
            {Object.entries(canCmd).map(([k, v]) => (
              <StatusBadge key={k} label={k} value={v} />
            ))}
          </Section>
        )}

        {/* ── CAN GPIO ── */}
        {Object.keys(canGpio).length > 0 && (
          <Section title="CAN GPIO" accent="purple">
            {Object.entries(canGpio).map(([k, v]) => (
              <StatusBadge key={k} label={k} value={v} />
            ))}
          </Section>
        )}

        {/* ── Runtime ── */}
        {(runtime.suctionSec != null || runtime.suction_total_seconds != null) && (
          <Section title="Runtime" accent="indigo">
            <KVRow
              label="Total Suction"
              value={fmtDuration(runtime.suctionSec ?? runtime.suction_total_seconds)}
            />
            {runtime.daily && Array.isArray(runtime.daily) && runtime.daily.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-400 mb-1 px-1">Daily breakdown (last 5 days)</p>
                {[...runtime.daily].reverse().slice(0, 5).map(([date, secs]) => (
                  <div key={date} className="flex items-center justify-between py-1 px-3">
                    <span className="text-xs text-gray-500">{date}</span>
                    <span className="text-xs font-medium text-indigo-600">{fmtDuration(secs)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Hmi32Monitor = () => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [liveUpdates, setLiveUpdates] = useState(0);
  const socketRef = useRef(null);

  const fetchLatest = async () => {
    try {
      setError('');
      const res  = await fetch(apiUrl('/api/hmi32/latest'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.message || 'Failed to fetch HMI32 data');
        return;
      }
      const rows = Array.isArray(data.data)
        ? data.data
        : data.data ? [data.data] : [];
      setMachines(rows);
    } catch {
      setError('Network error fetching HMI32 data');
    } finally {
      setLoading(false);
    }
  };

  const handleLiveEvent = (event, payload) => {
    if (!payload?.machineId) return;
    const machineId = String(payload.machineId).trim();

    setMachines((prev) => {
      const idx = prev.findIndex((m) => m.machineId === machineId);
      if (idx === -1) { fetchLatest(); return prev; }

      const updated  = [...prev];
      const existing = { ...updated[idx] };

      if (event === 'machine:state') {
        existing.state = payload;           // full payload with .states / .adc / .distance / .runtime
      } else if (event === 'machine:gps') {
        existing.gps = payload;
      } else if (event === 'machine:a25') {
        existing.a25 = payload;
      } else if (event === 'machine:can:cmd' && payload.cmd != null) {
        existing.canCmd = { ...(existing.canCmd || {}), [String(payload.cmd)]: payload.state };
      } else if (event === 'machine:can:gpio' && payload.cmd != null) {
        existing.canGpio = { ...(existing.canGpio || {}), [String(payload.cmd)]: payload.state };
      } else if (event === 'machine:runtime') {
        existing.runtime = payload;
      }

      existing.updated_at = new Date().toISOString();
      updated[idx] = existing;
      return updated;
    });

    setLiveUpdates((n) => n + 1);
  };

  useEffect(() => {
    fetchLatest();

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const events = [
      'machine:state', 'machine:gps', 'machine:a25',
      'machine:can:cmd', 'machine:can:gpio', 'machine:runtime',
    ];
    events.forEach((ev) => socket.on(ev, (payload) => handleLiveEvent(ev, payload)));

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading HMI32 Monitor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 sm:mt-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 sm:py-6 space-y-3 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-black">HMI32 Monitor</h1>
              <p className="text-gray-500 text-sm mt-1">
                Live machine state, ADC, distance &amp; runtime via Socket.IO
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-700">
                  Live — {liveUpdates} updates
                </span>
              </div>
              <button
                onClick={fetchLatest}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded text-sm flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {machines.length === 0 && !error ? (
          <div className="text-center py-16 bg-white rounded-lg shadow border border-gray-100">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="mt-3 text-gray-500 text-sm">No HMI32 data yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Waiting for machine socket events or run the import script.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {machines.map((row) => (
              <MachineCard key={row._id || row.machineId} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Hmi32Monitor;
