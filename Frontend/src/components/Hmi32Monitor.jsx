import { useState, useEffect } from 'react';
import { apiUrl } from '../api';

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

const MachineCard = ({ row }) => {
  const state = row.state || {};
  const adc = row.adc || {};
  const distance = row.distance || {};
  const runtime = row.runtime || {};

  // Extract only boolean states (ON/OFF)
  const booleanStates = Object.entries(state)
    .filter(([k, v]) => typeof v === 'boolean' && !['buttonColors'].includes(k))
    .sort(([a], [b]) => a.localeCompare(b));

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
          <p className="text-white text-xs">
            {row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Machine Control States */}
        {booleanStates.length > 0 && (
          <Section title="Machine Controls" accent="indigo">
            <div className="grid grid-cols-2 gap-2">
              {booleanStates.map(([k, v]) => (
                <StatusBadge key={k} label={k} value={v} />
              ))}
            </div>
          </Section>
        )}

        {/* ADC Sensors */}
        {(adc.suction != null || adc.pa0 != null) && (
          <Section title="Sensors" accent="blue">
            {adc.suction != null && <KVRow label="Suction" value={`${adc.suction}`} />}
            {adc.pa0 != null && <KVRow label="PA0" value={`${adc.pa0}`} />}
          </Section>
        )}

        {/* Distance */}
        {(distance.cm != null || distance.a25Cm != null) && (
          <Section title="Distance" accent="green">
            {distance.cm != null && <KVRow label="Distance" value={`${distance.cm} cm`} />}
            {distance.a25Cm != null && <KVRow label="A25" value={`${distance.a25Cm} cm`} />}
            {distance.a25Status && <KVRow label="Status" value={distance.a25Status} />}
          </Section>
        )}

        {/* Runtime Summary */}
        {runtime.suctionSec != null && (
          <Section title="Runtime" accent="purple">
            <KVRow label="Total Suction" value={fmtDuration(runtime.suctionSec)} />
            {Array.isArray(runtime.daily) && runtime.daily.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-2">Daily Hours (Last 7 days)</p>
                <div className="space-y-1">
                  {[...runtime.daily].reverse().slice(0, 7).map(([date, secs]) => (
                    <div key={date} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{date}</span>
                      <span className="font-medium text-indigo-600">{fmtDuration(secs)}</span>
                    </div>
                  ))}
                </div>
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
  const [history, setHistory] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

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

  const fetchHistory = async () => {
    try {
      const res  = await fetch(apiUrl('/api/hmi32/history'));
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const rows = Array.isArray(data.data) ? data.data : [];
        setHistory(rows);
        console.log('[Hmi32Monitor] Fetched history:', rows.length, 'records');
      } else {
        console.warn('[Hmi32Monitor] History fetch failed:', data.message);
      }
    } catch (err) {
      console.error('[Hmi32Monitor] History fetch error:', err.message);
    }
  };

  useEffect(() => {
    fetchLatest();
    fetchHistory();
    // Poll every 2 seconds for fresh real-time data (like QML logs)
    const interval = setInterval(() => {
      fetchLatest();
      fetchHistory();
    }, 2000);
    return () => clearInterval(interval);
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
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 sm:mt-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 sm:py-6 space-y-3 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-black">HMI32 Monitor</h1>
              <p className="text-gray-500 text-sm mt-1">Real-time machine state tracking</p>
            </div>
            <button
              onClick={() => {
                fetchLatest();
                fetchHistory();
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded text-sm flex items-center self-start sm:self-auto"
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}
        
        {/* Latest State */}
        {machines.length > 0 ? (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Latest State</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {machines.map((row) => (
                <MachineCard key={row._id || row.machineId} row={row} />
              ))}
            </div>
          </div>
        ) : !loading && (
          <div className="text-center py-16 bg-white rounded-lg shadow border border-gray-100">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="mt-3 text-gray-500 text-sm">No HMI32 data yet.</p>
          </div>
        )}

        {/* State Change History */}
        {history.length > 0 ? (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">State Change History (Last {history.length})</h2>
            <div className="bg-white border border-gray-200 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Timestamp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Machine ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">State Changes</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">PA0 ADC</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">A25 Distance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[...history].reverse().map((item, idx) => {
                      const state = item.state || {};
                      const adc = item.adc || {};
                      const distance = item.distance || {};
                      const onStates = Object.entries(state)
                        .filter(([k, v]) => v === true && k !== 'buttonColors' && typeof v === 'boolean')
                        .map(([k]) => k);

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                            {item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {item.machineId || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {onStates.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {onStates.map((s) => (
                                  <span key={s} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    {s} ON
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">All OFF</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {adc.pa0 ?? '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {distance.a25Cm ?? '-'} cm
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-500 text-sm">No state changes recorded yet.</p>
            <p className="text-gray-400 text-xs mt-1">State changes will appear here as they happen.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Hmi32Monitor;
