import { useState, useEffect } from 'react';
import { apiUrl } from '../api';
import { reverseGeocode } from '../utils/geocode';
import GpsTrackingTrail from './GpsTrackingTrail';

const GpsData = () => {
  const [gpsData, setGpsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [addresses, setAddresses] = useState({});
  const [viewMode, setViewMode] = useState('cards'); // 'cards', 'live', 'history', 'trail'
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedDeviceForTrail, setSelectedDeviceForTrail] = useState('');

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (!storedToken) {
      setError('No authentication token found. Please login again.');
      setLoading(false);
      return;
    }
    
    setToken(storedToken);
    fetchGpsData(storedToken);

    // Set up auto-refresh interval (every 1 minute)
    const interval = setInterval(() => {
      fetchGpsData(storedToken);
    }, 60000);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  // Fetch addresses for GPS coordinates
  useEffect(() => {
    const fetchAddresses = async () => {
      const newAddresses = {};
      
      for (const device of gpsData) {
        const gps = device.gps || {};
        if (gps.latitude && gps.longitude && !addresses[device.deviceId]) {
          try {
            const address = await reverseGeocode(gps.latitude, gps.longitude);
            newAddresses[device.deviceId] = address;
          } catch (error) {
            console.error(`Failed to fetch address for device ${device.deviceId}:`, error);
            newAddresses[device.deviceId] = 'Address not available';
          }
        }
      }
      
      if (Object.keys(newAddresses).length > 0) {
        setAddresses(prev => ({ ...prev, ...newAddresses }));
      }
    };

    if (gpsData.length > 0) {
      fetchAddresses();
    }
  }, [gpsData]);

  const fetchGpsData = async (authToken) => {
    try {
      setLoading(true);
      setError('');

      // First get device data to get device IDs
      const deviceResponse = await fetch(apiUrl('/api/devices'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const deviceData = await deviceResponse.json();
      
      if (!deviceData.success || !deviceData.data?.data?.list) {
        setError('Failed to fetch device data');
        setLoading(false);
        return;
      }

      const deviceIds = deviceData.data.data.list.map(device => device.deviceId);
      
      if (deviceIds.length === 0) {
        setError('No devices found');
        setLoading(false);
        return;
      }

      // Now fetch GPS data for these devices
      const gpsResponse = await fetch(apiUrl('/api/gps/latest'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceIds })
      });

      const gpsResult = await gpsResponse.json();

      if (gpsResult.success) {
        // Handle real API response structure
        const gpsList = gpsResult.data?.data?.list || [];
        setGpsData(gpsList);
        console.log('Real GPS data fetched:', gpsResult.data);
      } else {
        setError(gpsResult.message || 'Failed to fetch GPS data');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('GPS fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (token) {
      fetchGpsData(token);
    }
  };

  const fetchHistoryData = async (authToken) => {
    try {
      setHistoryLoading(true);
      setHistoryError('');

      const historyResponse = await fetch(apiUrl('/api/gps/mongo-history'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const rawText = await historyResponse.text();
      let historyResult = null;
      try {
        historyResult = rawText ? JSON.parse(rawText) : {};
      } catch {
        setHistoryError(
          historyResponse.status === 404
            ? 'GPS history API missing on server (404). Restart or redeploy the backend so GET /api/gps/history/db is available.'
            : `Bad response (${historyResponse.status}). Expected JSON from the API.`
        );
        return;
      }

      if (!historyResponse.ok) {
        setHistoryError(
          historyResult?.message ||
            `Request failed (${historyResponse.status}). Check that the backend is running the latest code.`
        );
        return;
      }

      if (historyResult.success) {
        const historyList = historyResult.data?.data?.list || [];
        setHistoryData(historyList);
      } else {
        setHistoryError(historyResult.message || 'Failed to fetch history from database');
      }
    } catch (err) {
      const msg = String(err?.message || err);
      const unreachable =
        err?.name === 'TypeError' || msg.toLowerCase().includes('failed to fetch');
      setHistoryError(
        unreachable
          ? 'Cannot reach the API. Start the backend on port 3001, or remove VITE_API_BASE_URL from Frontend/.env.development so Vite proxies /api to the server.'
          : msg
      );
      console.error('History fetch error:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLiveClick = () => {
    setViewMode('live');
  };

  const handleHistoryClick = () => {
    setViewMode('history');
    if (token) {
      fetchHistoryData(token);
    }
  };

  const handleBackToCards = () => {
    setViewMode('cards');
  };

  const handleTrailClick = (deviceId) => {
    setSelectedDeviceForTrail(deviceId);
    setViewMode('trail');
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading GPS data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render Live View
  if (viewMode === 'live') {
    return (
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center mb-4">
            <button
              onClick={handleBackToCards}
              className="mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Live GPS Tracking
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base lg:text-lg">Real-time location monitoring of all devices</p>
            </div>
          </div>
        </div>

        {/* Live GPS Data Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {gpsData.map((device) => {
            const gps = device.gps || {};
            const alarms = gps.alarmFlags || {};
            const status = gps.statusFlags || {};
            
            let mileage = 0;
            let signalStrength = 0;
            let gnssCount = 0;
            
            if (gps.additionalInfos && Array.isArray(gps.additionalInfos)) {
              gps.additionalInfos.forEach(info => {
                if (info.id === 1) mileage = info.mileage || 0;
                if (info.id === 48) signalStrength = info.signalStrength || 0;
                if (info.id === 49) gnssCount = info.gnssCount || 0;
              });
            }

            return (
              <div key={device.deviceId} className="bg-gradient-to-br from-white via-white to-blue-50 border border-blue-100 rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 overflow-hidden">
                {/* Card Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-white truncate">{device.deviceId}</h3>
                      <p className="text-blue-100 text-xs sm:text-sm">Live Tracking</p>
                    </div>
                    <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold ${
                      status.acc 
                        ? 'bg-green-500 text-white shadow-lg' 
                        : 'bg-gray-500 text-white shadow-lg'
                    }`}>
                      {status.acc ? 'ACC ON' : 'ACC OFF'}
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 sm:p-6">
                  {/* Location Info */}
                  <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                    <div className="flex items-center mb-2">
                      <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span className="font-semibold text-gray-700">Live Location</span>
                    </div>
                    <p className="text-sm sm:text-lg font-mono text-gray-900 break-all">
                      {(gps.latitude || 0).toFixed(6)}, {(gps.longitude || 0).toFixed(6)}
                    </p>
                    {addresses[device.deviceId] && (
                      <div className="mt-3 flex items-start">
                        <svg className="w-4 h-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <p className="text-sm text-gray-600 leading-relaxed">{addresses[device.deviceId]}</p>
                      </div>
                    )}
                  </div>

                  {/* Live Status Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-xl border border-green-200">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Speed</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-gray-900">{gps.speed || 0} km/h</p>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-xl border border-blue-200">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Direction</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-gray-900">{gps.direction || 0}°</p>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-xl border border-purple-200">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Altitude</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-gray-900">{gps.altitude || 0}m</p>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-3 rounded-xl border border-yellow-200">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Signal</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-gray-900">{signalStrength}/31</p>
                    </div>
                  </div>

                  {/* Live Indicators */}
                  <div className="flex gap-3 mb-6">
                    <div className={`flex-1 text-center p-3 rounded-xl font-semibold ${
                      status.moving 
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-lg'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {status.moving ? 'Moving' : 'Stopped'}
                    </div>
                    <div className={`flex-1 text-center p-3 rounded-xl font-semibold flex items-center justify-center ${
                      status.gpsPositioned 
                        ? 'bg-gradient-to-r from-green-400 to-green-500 text-white shadow-lg'
                        : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-lg'
                    }`}>
                      <div className={`w-2 h-2 rounded-full mr-2 ${status.gpsPositioned ? 'bg-white' : 'bg-white'}`}></div>
                      {status.gpsPositioned ? 'GPS Good' : 'GPS Poor'}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center text-sm mb-3">
                      <span className="text-gray-500">Last Update</span>
                      <span className="font-medium text-gray-900">
                        {gps.time ? formatDate(gps.time) : 'Not available'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleTrailClick(device.deviceId)}
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center shadow transition-all duration-200 hover:scale-105"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 7m0 13V7" />
                      </svg>
                      View Tracking Trail
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render History View
  if (viewMode === 'history') {
    return (
      <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center mb-4">
            <button
              onClick={handleBackToCards}
              className="mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                GPS History
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base lg:text-lg">
                {historyLoading
                  ? 'Loading from MongoDB collection gps_data…'
                  : `All GPS records stored in MongoDB (${historyData.length} rows)`}
              </p>
            </div>
          </div>
        </div>

        {historyError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
            {historyError}
            <button
              type="button"
              onClick={() => token && fetchHistoryData(token)}
              className="ml-3 font-semibold text-red-900 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {historyLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading history data...</p>
            </div>
          </div>
        ) : historyData.length > 0 ? (
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                  <tr className="text-left text-gray-700">
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Device</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Time</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Lat, Long</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Speed</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Dir</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Alt</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">ACC</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Moving</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {historyData.map((record, index) => {
                    const gps = record.gps || {};
                    const rowKey = record._id != null ? String(record._id) : `${record.deviceId}-${index}`;
                    return (
                      <tr key={rowKey} className="hover:bg-purple-50/40">
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                          {record.deviceId}
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {gps.time ? formatDate(gps.time) : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">
                          {(gps.latitude ?? 0).toFixed(6)}, {(gps.longitude ?? 0).toFixed(6)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{gps.speed ?? 0}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{gps.direction ?? 0}°</td>
                        <td className="px-3 py-2 whitespace-nowrap">{gps.altitude ?? 0}m</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {gps.statusFlags?.acc ? 'ON' : 'OFF'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {gps.statusFlags?.moving ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-600 text-lg">No history data available</p>
            <p className="text-gray-500 text-sm mt-2">Historical data will appear here once available</p>
          </div>
        )}
      </div>
    );
  }

  // Render Trail View
  if (viewMode === 'trail') {
    return (
      <GpsTrackingTrail
        deviceId={selectedDeviceForTrail}
        token={token}
        onBack={handleBackToCards}
      />
    );
  }

  // Default Card Selection View
  return (
    <div className="min-h-screen bg-white p-4 sm:p-6 lg:p-8 mt-16 sm:mt-0">
      {/* Header Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              GPS Data Module
            </h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base lg:text-lg">Choose between Live tracking and Historical data</p>
          </div>
          <button
            onClick={handleRefresh}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-2 sm:py-3 px-4 sm:px-6 rounded-xl flex items-center shadow-lg transform transition-all duration-200 hover:scale-105 text-sm sm:text-base"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Refresh Data</span>
            <span className="sm:hidden">Refresh</span>
          </button>
        </div>
      </div>

      {/* GPS Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        <div className="bg-gradient-to-br from-white to-blue-50 border border-blue-100 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Devices</dt>
                  <dd className="text-2xl font-bold text-gray-900">{gpsData.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-blue-50 border border-blue-100 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">ACC ON</dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {gpsData.filter(device => device.gps?.statusFlags?.acc).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-yellow-50 border border-yellow-100 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Moving</dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {gpsData.filter(device => device.gps?.statusFlags?.moving).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-red-50 border border-red-100 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.502 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Alarms</dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {gpsData.filter(device => {
                      const alarms = device.gps?.alarmFlags;
                      return alarms && Object.values(alarms).some(alarm => alarm === true);
                    }).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-purple-50 border border-purple-100 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">GPS Signal</dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    {gpsData.filter(device => device.gps?.statusFlags?.gpsPositioned).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Live Card */}
        <div 
          onClick={handleLiveClick}
          className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 cursor-pointer overflow-hidden group"
        >
          <div className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Live Tracking</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                View real-time GPS data from all your devices. See current locations, speed, and status updates instantly.
              </p>
              <div className="flex items-center text-blue-600 font-semibold">
                <span>View Live Data</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4">
            <div className="flex justify-between items-center text-white">
              <span className="text-sm font-medium">Active Devices</span>
              <span className="text-xl font-bold">{gpsData.length}</span>
            </div>
          </div>
        </div>

        {/* History Card */}
        <div 
          onClick={handleHistoryClick}
          className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 cursor-pointer overflow-hidden group"
        >
          <div className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">History</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Browse historical GPS data and tracking records. View past locations, routes, and device history.
              </p>
              <div className="flex items-center text-purple-600 font-semibold">
                <span>View History</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-4">
            <div className="flex justify-between items-center text-white">
              <span className="text-sm font-medium">Source</span>
              <span className="text-xl font-bold">MongoDB · gps_data</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GpsData;
