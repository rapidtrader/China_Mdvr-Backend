import { useState, useEffect, useMemo } from 'react';
import { apiUrl } from '../api';

const STATUS_FILTERS = [
  { id: 'all', label: 'ALL', border: 'border-blue-500', text: 'text-blue-600', activeBg: 'bg-blue-50' },
  { id: 'running', label: 'RUNNING', border: 'border-green-500', text: 'text-green-600', activeBg: 'bg-green-50' },
  { id: 'stopped', label: 'STOPPED', border: 'border-red-500', text: 'text-red-600', activeBg: 'bg-red-50' },
  { id: 'overspeed', label: 'OVERSPEED', border: 'border-orange-500', text: 'text-orange-600', activeBg: 'bg-orange-50' },
  { id: 'idle', label: 'IDLE', border: 'border-yellow-500', text: 'text-yellow-600', activeBg: 'bg-yellow-50' },
  { id: 'unreachable', label: 'UNREACHABLE', border: 'border-sky-500', text: 'text-sky-600', activeBg: 'bg-sky-50' },
  { id: 'new', label: 'NEW', border: 'border-gray-400', text: 'text-gray-600', activeBg: 'bg-gray-50' },
  { id: 'inactive', label: 'INACTIVE', border: 'border-gray-900', text: 'text-gray-900', activeBg: 'bg-gray-100' },
];

const COLUMNS = [
  { id: 'sn', label: 'SN', sortable: false },
  { id: 'vehicleNo', label: 'Vehicle No.', sortable: true },
  { id: 'state', label: 'State', sortable: true },
  { id: 'vehicleType', label: 'V_Type', sortable: true },
  { id: 'lu', label: 'Last Updated', sortable: true },
  { id: 'since', label: 'Since', sortable: true },
  { id: 'overspeed', label: 'Overspeed', sortable: true },
  { id: 'mileage', label: 'Mileage', sortable: true },
  { id: 'odometer', label: 'Odometer(km)', sortable: true },
  { id: 'alias', label: 'Vehicle Nickname', sortable: true },
  { id: 'loadingStatus', label: 'Loading Status', sortable: false },
  { id: 'subscriptionStart', label: 'Sub_Start', sortable: true },
  { id: 'subscriptionDue', label: 'Sub_Due', sortable: true },
];

const getVehicleCategory = (v) => {
  const state = String(v.state || '').toLowerCase();
  if (!v.status || state.includes('no data') || state.includes('unreachable') || state.includes('offline')) {
    return 'unreachable';
  }
  if (String(v.vehicleStatus || '').toLowerCase() === 'inactive' || v.status === false) {
    return 'inactive';
  }
  if (state.includes('running') || state.includes('moving')) return 'running';
  if (state.includes('idle')) return 'idle';
  if (state.includes('overspeed')) return 'overspeed';
  if (state.includes('off') || state.includes('stop') || state.includes('parked')) return 'stopped';
  return 'stopped';
};

const SortIcon = ({ active, dir }) => (
  <span className="inline-flex flex-col ml-1 -space-y-1 opacity-80">
    <svg className={`w-2.5 h-2.5 ${active && dir === 'asc' ? 'text-white' : 'text-white/50'}`} viewBox="0 0 10 6" fill="currentColor">
      <path d="M5 0L9 5H1L5 0Z" />
    </svg>
    <svg className={`w-2.5 h-2.5 ${active && dir === 'desc' ? 'text-white' : 'text-white/50'}`} viewBox="0 0 10 6" fill="currentColor">
      <path d="M5 6L1 1H9L5 6Z" />
    </svg>
  </span>
);

const StatusBox = ({ count, filter, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center justify-center min-w-[72px] h-[52px] border-2 rounded bg-white transition-all ${
      filter.border
    } ${active ? `${filter.activeBg} ring-2 ring-offset-1 ring-current ${filter.text}` : 'hover:bg-gray-50'}`}
  >
    <span className={`text-lg font-bold leading-none ${filter.text}`}>{count}</span>
    <span className={`text-[10px] font-bold mt-1 tracking-wide ${filter.text}`}>{filter.label}</span>
  </button>
);

const TbtrackVehiclesPage = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetched, setLastFetched] = useState(null);
  const [savedInfo, setSavedInfo] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('vehicleNo');
  const [sortDir, setSortDir] = useState('asc');
  const [visibleCols, setVisibleCols] = useState(() =>
    Object.fromEntries(COLUMNS.map((c) => [c.id, true]))
  );
  const [showColMenu, setShowColMenu] = useState(false);

  const fetchVehicles = async () => {
    try {
      setError('');
      const res = await fetch(apiUrl('/api/hmi32/tbtrack/vehicles'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.message || 'Failed to fetch vehicle data');
        return;
      }
      setVehicles(Array.isArray(data.data) ? data.data : []);
      setSavedInfo(data.saved || null);
      setLastFetched(new Date());
    } catch {
      setError('Network error fetching vehicle data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
    const interval = setInterval(fetchVehicles, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusCounts = useMemo(() => {
    const counts = { all: vehicles.length, running: 0, stopped: 0, overspeed: 0, idle: 0, unreachable: 0, new: 0, inactive: 0 };
    vehicles.forEach((v) => {
      const cat = getVehicleCategory(v);
      if (counts[cat] !== undefined) counts[cat] += 1;
    });
    return counts;
  }, [vehicles]);

  const searched = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter((v) =>
      String(v.vehicleNo || '').toLowerCase().includes(q) ||
      String(v.alias || '').toLowerCase().includes(q) ||
      String(v.state || '').toLowerCase().includes(q) ||
      String(v.address || '').toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'all') return searched;
    return searched.filter((v) => getVehicleCategory(v) === statusFilter);
  }, [searched, statusFilter]);

  const sorted = useMemo(() => {
    const rows = [...statusFiltered];
    const getVal = (v, col) => {
      if (col === 'vehicleType') return v.vehicleType || '';
      if (col === 'alias') return v.alias || '';
      if (col === 'loadingStatus') return '--';
      return v[col] ?? '';
    };
    rows.sort((a, b) => {
      const av = getVal(a, sortCol);
      const bv = getVal(b, sortCol);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [statusFiltered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (colId) => {
    if (sortCol === colId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colId);
      setSortDir('asc');
    }
  };

  const cellValue = (v, colId) => {
    switch (colId) {
      case 'vehicleType':
        return v.vehicleType ? String(v.vehicleType) : '--';
      case 'alias':
        return v.alias || '';
      case 'loadingStatus':
        return '--';
      case 'overspeed':
        return v.overspeed ?? '--';
      case 'mileage':
        return v.mileage ?? '--';
      case 'odometer':
        return v.odometer ?? '--';
      case 'subscriptionStart':
        return v.subscriptionStart || '--';
      case 'subscriptionDue':
        return v.subscriptionDue || '--';
      default:
        return v[colId] ?? '--';
    }
  };

  const activeColumns = COLUMNS.filter((c) => visibleCols[c.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f9]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4a235a] mx-auto mb-4" />
          <p className="text-gray-600">Loading vehicles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <div className="bg-white border-b border-gray-200 mt-16 sm:mt-0">
        <div className="max-w-[100%] px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-lg font-semibold text-gray-800">Vehicle List</h1>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {lastFetched && <span>Updated {lastFetched.toLocaleTimeString()}</span>}
              {savedInfo && <span className="text-green-600">Saved ({savedInfo.latest})</span>}
              <button
                type="button"
                onClick={() => { setLoading(true); fetchVehicles(); }}
                className="text-[#4a235a] hover:underline font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {/* Status filter boxes */}
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_FILTERS.map((f) => (
            <StatusBox
              key={f.id}
              count={statusCounts[f.id] ?? 0}
              filter={f}
              active={statusFilter === f.id}
              onClick={() => { setStatusFilter(f.id); setPage(1); }}
            />
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-gray-200 rounded-t-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#4a235a]"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none"
            >
              <option value={10}>No of Rows: 10</option>
              <option value={25}>No of Rows: 25</option>
              <option value={50}>No of Rows: 50</option>
              <option value={100}>No of Rows: 100</option>
            </select>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColMenu((v) => !v)}
                className="border border-gray-300 rounded px-3 py-2 text-sm bg-white hover:bg-gray-50"
              >
                Column Visibility ▾
              </button>
              {showColMenu && (
                <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded shadow-lg p-3 w-52 max-h-64 overflow-y-auto">
                  {COLUMNS.filter((c) => c.id !== 'sn').map((col) => (
                    <label key={col.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleCols[col.id]}
                        onChange={(e) => setVisibleCols((prev) => ({ ...prev, [col.id]: e.target.checked }))}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[#4a235a] text-white">
                  {activeColumns.map((col) => (
                    <th
                      key={col.id}
                      className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap border-r border-[#5c2d73] last:border-r-0"
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.id)}
                          className="flex items-center hover:text-white/90"
                        >
                          {col.label}
                          <SortIcon active={sortCol === col.id} dir={sortDir} />
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumns.length} className="px-4 py-12 text-center text-gray-500">
                      No vehicles found
                    </td>
                  </tr>
                ) : (
                  paginated.map((v, idx) => {
                    const meta = v.terminalPacketMeta || {};
                    const [lng, lat] = Array.isArray(meta.pLoc) ? meta.pLoc : [null, null];
                    const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;
                    const rowNum = (page - 1) * pageSize + idx + 1;

                    return (
                      <tr
                        key={v.ouid || v.deviceId || v.vehicleNo}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-[#eef2f7]'}
                      >
                        {activeColumns.map((col) => {
                          if (col.id === 'sn') {
                            return (
                              <td key={col.id} className="px-3 py-2 text-sm text-gray-700 border-b border-gray-200 whitespace-nowrap">
                                {rowNum}
                              </td>
                            );
                          }
                          if (col.id === 'vehicleNo') {
                            return (
                              <td key={col.id} className="px-3 py-2 text-sm border-b border-gray-200 whitespace-nowrap">
                                {mapsUrl ? (
                                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                                    {v.vehicleNo || '--'}
                                  </a>
                                ) : (
                                  <span className="text-blue-600 font-medium">{v.vehicleNo || '--'}</span>
                                )}
                              </td>
                            );
                          }
                          if (col.id === 'state') {
                            return (
                              <td key={col.id} className="px-3 py-2 text-sm text-gray-700 border-b border-gray-200 whitespace-nowrap">
                                {v.state || '--'}
                              </td>
                            );
                          }
                          return (
                            <td key={col.id} className="px-3 py-2 text-sm text-gray-700 border-b border-gray-200 whitespace-nowrap">
                              {cellValue(v, col.id)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border border-gray-300 rounded bg-white disabled:opacity-40 hover:bg-gray-100"
                >
                  Prev
                </button>
                <span className="px-2">{page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border border-gray-300 rounded bg-white disabled:opacity-40 hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TbtrackVehiclesPage;
