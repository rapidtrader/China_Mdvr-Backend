import { useState, useEffect } from 'react';
import { apiUrl } from '../api';

// Format seconds to readable string: e.g. "2m 15s" or "1h 5m"
const fmtDuration = (sec) => {
  if (!sec || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const StatCard = ({ label, value, sub, color = 'indigo' }) => {
  const colors = {
    indigo: 'bg-indigo-600',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
      <div className={`h-1 ${colors[color]}`} />
      <div className="p-5">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
};

const ReportsPage = () => {
  const [sessions, setSessions] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [sessRes, rtRes] = await Promise.all([
        fetch(apiUrl('/api/hmi32/reports/sessions')),
        fetch(apiUrl('/api/hmi32/reports/runtime')),
      ]);

      const sessData = await sessRes.json().catch(() => ({}));
      const rtData = await rtRes.json().catch(() => ({}));

      if (sessData.success !== false) {
        setSessions(Array.isArray(sessData.data) ? sessData.data : []);
      } else {
        setError(sessData.message || 'Failed to load session data');
      }

      if (rtData.success !== false) {
        setRuntime(rtData.data || null);
      }
    } catch {
      setError('Network error loading reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Unique machine IDs for filter dropdown
  const machineIds = [...new Set(sessions.map((s) => s.machine_id).filter(Boolean))];

  // Apply filters
  const filtered = sessions.filter((s) => {
    if (filterDate && s.date !== filterDate) return false;
    if (filterMachine && s.machine_id !== filterMachine) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats from filtered set — duration field: total_running_time (seconds int) from Pi
  const getDur = (s) => Number(s.total_running_time || s.duration_sec || 0);
  const totalDuration = filtered.reduce((sum, s) => sum + getDur(s), 0);
  const avgDuration = filtered.length > 0 ? totalDuration / filtered.length : 0;
  const maxSession = filtered.length > 0 ? Math.max(...filtered.map(getDur)) : 0;

  const dailyData = runtime?.daily_seconds || {};
  const sortedDates = Object.keys(dailyData).sort().reverse();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Reports...</p>
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
              <h1 className="text-xl sm:text-2xl font-bold text-black">Reports</h1>
              <p className="text-gray-500 text-sm mt-1">Suction sessions &amp; machine runtime history</p>
            </div>
            <button
              onClick={fetchData}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded text-sm flex items-center self-start sm:self-auto"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Summary Stats */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Summary</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Suction Time"
              value={fmtDuration(runtime?.suction_total_seconds || 0)}
              sub="all time"
              color="indigo"
            />
            <StatCard
              label="Total Sessions"
              value={filtered.length}
              sub={filterDate || filterMachine ? 'filtered' : 'all sessions'}
              color="green"
            />
            <StatCard
              label="Avg Session"
              value={fmtDuration(avgDuration)}
              sub="filtered"
              color="yellow"
            />
            <StatCard
              label="Longest Session"
              value={fmtDuration(maxSession)}
              sub="filtered"
              color="red"
            />
          </div>
        </div>

        {/* Daily Runtime Chart (simple bar-like table) */}
        {sortedDates.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Daily Runtime</h2>
            <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/2">Bar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedDates.slice(0, 10).map((date) => {
                      const secs = dailyData[date] || 0;
                      const maxSecs = Math.max(...Object.values(dailyData));
                      const pct = maxSecs > 0 ? Math.round((secs / maxSecs) * 100) : 0;
                      return (
                        <tr key={date} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700 font-medium whitespace-nowrap">{date}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDuration(secs)}</td>
                          <td className="px-4 py-3">
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className="bg-indigo-500 h-2 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sessions Table */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 space-y-3 sm:space-y-0">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Suction Sessions</h2>
            <div className="flex flex-wrap gap-2">
              {/* Date filter */}
              <input
                type="date"
                value={filterDate}
                onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              {/* Machine filter */}
              <select
                value={filterMachine}
                onChange={(e) => { setFilterMachine(e.target.value); setPage(1); }}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">All Machines</option>
                {machineIds.map((id) => (
                  <option key={id} value={id}>{id || '(no id)'}</option>
                ))}
              </select>
              {(filterDate || filterMachine) && (
                <button
                  onClick={() => { setFilterDate(''); setFilterMachine(''); setPage(1); }}
                  className="text-sm text-red-500 border border-red-200 bg-red-50 rounded px-3 py-1.5 hover:bg-red-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
            {paginated.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No sessions found for selected filters.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stop</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Machine</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Synced</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginated.map((s, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{s.date}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{s.start_time || s.start || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                            {s.stop_time || s.stop
                              ? (s.stop_time || s.stop)
                              : <span className="text-yellow-500 font-medium">Running</span>}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-indigo-700 whitespace-nowrap">
                            {s.total_running_time_formatted || fmtDuration(s.total_running_time || s.duration_sec || 0)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{s.machine_id || '-'}</td>
                          <td className="px-4 py-3">
                            {s.synced ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Synced</span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Local</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <span className="text-xs text-gray-500">
                      Page {page} of {totalPages} — {filtered.length} sessions
                    </span>
                    <div className="flex space-x-2">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-3 py-1 text-xs border rounded disabled:opacity-40 hover:bg-white"
                      >
                        Prev
                      </button>
                      <button
                        disabled={page === totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-3 py-1 text-xs border rounded disabled:opacity-40 hover:bg-white"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
