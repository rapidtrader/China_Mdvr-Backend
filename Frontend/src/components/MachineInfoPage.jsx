import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { apiUrl, getSocketUrl } from '../api';

const SOCKET_URL = getSocketUrl();

const InfoRow = ({ label, value, highlight = false }) => (
  <div className={`flex items-center justify-between py-2.5 px-4 rounded-lg border ${
    highlight ? 'bg-indigo-50 border-indigo-100' : 'bg-gray-50 border-gray-100'
  }`}>
    <span className="text-sm text-gray-500 font-medium">{label}</span>
    <span className={`text-sm font-semibold ${highlight ? 'text-indigo-700' : 'text-gray-800'}`}>
      {value ?? '-'}
    </span>
  </div>
);

const MachineInfoPage = () => {
  const [machines, setMachines] = useState([]);   // from hmi32_latest (live)
  const [dbInfos, setDbInfos] = useState([]);      // from machineinfos (DB)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveCount, setLiveCount] = useState(0);
  const socketRef = useRef(null);

  const fetchData = async () => {
    try {
      setError('');
      const [liveRes, dbRes] = await Promise.all([
        fetch(apiUrl('/api/hmi32/latest')),
        fetch(apiUrl('/api/hmi32/machine-info')),
      ]);

      const liveData = await liveRes.json().catch(() => ({}));
      const dbData = await dbRes.json().catch(() => ({}));

      const liveRows = Array.isArray(liveData.data)
        ? liveData.data
        : liveData.data ? [liveData.data] : [];
      setMachines(liveRows);

      const dbRows = Array.isArray(dbData.data)
        ? dbData.data
        : dbData.data ? [dbData.data] : [];
      setDbInfos(dbRows);
    } catch {
      setError('Network error fetching machine info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.onAny((event, payload) => {
      if (!event.startsWith('machine:') || !payload?.machineId) return;
      const machineId = String(payload.machineId).trim();

      setMachines((prev) => {
        const idx = prev.findIndex((m) => m.machineId === machineId);
        if (idx === -1) { fetchData(); return prev; }
        const updated = [...prev];
        const existing = { ...updated[idx] };
        if (event === 'machine:state') existing.state = payload;
        else if (event === 'machine:gps') existing.gps = payload;
        existing.updated_at = new Date().toISOString();
        updated[idx] = existing;
        return updated;
      });

      setLiveCount((n) => n + 1);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge live + DB info by machineId
  const allMachineIds = [
    ...new Set([
      ...machines.map((m) => m.machineId),
      ...dbInfos.map((d) => d.machineId),
    ]),
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Machine Info...</p>
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
              <h1 className="text-xl sm:text-2xl font-bold text-black">Machine Info</h1>
              <p className="text-gray-500 text-sm mt-1">
                Identity &amp; live status of connected machines
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-700">
                  Live — {liveCount} events
                </span>
              </div>
              <button
                onClick={fetchData}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded text-sm flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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

        {allMachineIds.length === 0 && !error ? (
          <div className="text-center py-16 bg-white rounded-lg shadow border border-gray-100">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
            <p className="mt-3 text-gray-500 text-sm">No machine data available.</p>
            <p className="text-gray-400 text-xs mt-1">
              Run the import script or connect a machine via socket.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {allMachineIds.map((mid) => {
              const live = machines.find((m) => m.machineId === mid);
              const db = dbInfos.find((d) => d.machineId === mid);
              const state = live?.state || {};
              const gps = live?.gps || {};
              const isLive = !!live;

              return (
                <div key={mid} className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-white font-bold">{mid}</p>
                          <p className="text-indigo-200 text-xs">
                            {live?.lastEvent || 'No live events yet'}
                          </p>
                        </div>
                      </div>
                      <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-full ${
                        isLive ? 'bg-green-500 bg-opacity-30' : 'bg-white bg-opacity-10'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          isLive ? 'bg-green-300 animate-pulse' : 'bg-gray-300'
                        }`} />
                        <span className="text-xs text-white font-medium">
                          {isLive ? 'Live' : 'DB Only'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    {/* Identity from DB */}
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pt-1">
                      Identity
                    </p>
                    <InfoRow label="Machine ID" value={mid} highlight />
                    <InfoRow
                      label="Client Name"
                      value={db?.clientName || state?.clientName || '-'}
                    />
                    <InfoRow
                      label="Location"
                      value={db?.location || state?.location || '-'}
                    />
                    <InfoRow
                      label="Vehicle Plate"
                      value={db?.vehiclePlateNo || state?.vehiclePlateNo || '-'}
                      highlight
                    />

                    {/* Live status */}
                    {isLive && (
                      <>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pt-2">
                          Live Status
                        </p>
                        <InfoRow
                          label="Last Updated"
                          value={
                            live.updated_at
                              ? new Date(live.updated_at).toLocaleString()
                              : '-'
                          }
                        />
                        <InfoRow label="Last Event" value={live.lastEvent || '-'} />

                        {/* GPS */}
                        {gps.lat != null && (
                          <InfoRow
                            label="GPS"
                            value={`${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)}`}
                          />
                        )}
                        {gps.speed != null && (
                          <InfoRow label="Speed" value={`${gps.speed} km/h`} />
                        )}
                      </>
                    )}

                    {/* DB timestamps */}
                    {db?.updated_at && (
                      <>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pt-2">
                          Database
                        </p>
                        <InfoRow
                          label="Last Saved"
                          value={new Date(db.updated_at).toLocaleString()}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MachineInfoPage;
