import { useState, useEffect } from 'react';
import { apiUrl } from '../api';

const DeviceStatus = () => {
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    // Get token from localStorage
    const storedToken = localStorage.getItem('authToken');
    if (!storedToken) {
      setError('No authentication token found. Please login again.');
      setLoading(false);
      return;
    }
    
    setToken(storedToken);
    fetchStatusData(storedToken);

    // Set up auto-refresh interval (every 1 minute)
    const interval = setInterval(() => {
      fetchStatusData(storedToken);
    }, 60000);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  const fetchStatusData = async (authToken) => {
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

      // Now fetch device status for these devices
      const statusResponse = await fetch(apiUrl('/api/device/states'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceIds })
      });

      const statusResult = await statusResponse.json();

      if (statusResult.success) {
        setStatusData(statusResult.data?.data?.list || []);
        console.log('Real device status data fetched:', statusResult.data);
      } else {
        setError(statusResult.message || 'Failed to fetch device status');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Device status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (token) {
      fetchStatusData(token);
    }
  };

  const getStateColor = (state) => {
    if (state === 1) return 'bg-green-100 text-green-800'; // Online
    if (state === 0) return 'bg-red-100 text-red-800';   // Offline
    return 'bg-yellow-100 text-yellow-800';              // Low power (state = 2)
  };

  const getStateText = (state) => {
    if (state === 1) return 'Online';    // Online
    if (state === 0) return 'Offline';   // Offline
    return 'Low Power';                  // Low power (state = 2)
  };

  const getAccStateColor = (accState) => {
    return accState === 0 ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800';
  };

  const getAccStateText = (accState) => {
    return accState === 0 ? 'ACC OFF' : 'ACC ON';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading device status...</p>
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

  return (
    <div className="p-4 sm:p-6 mt-16 sm:mt-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Device Status</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">Real-time device status monitoring</p>
        </div>
        <button
          onClick={handleRefresh}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded flex items-center text-sm sm:text-base"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Status Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Devices</dt>
                  <dd className="text-lg font-medium text-gray-900">{statusData.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-600 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Online</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {statusData.filter(device => device.state === 1).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-600 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Offline</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {statusData.filter(device => device.state === 0).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-600 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">ACC ON</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {statusData.filter(device => device.accState === 1).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Device Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {statusData.map((status) => (
          <div key={status.deviceId} className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow duration-300">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 space-y-2 sm:space-y-0">
                <div className="flex-1">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate">{status.deviceId}</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Device Status Monitor</p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStateColor(status.state)}`}>
                  {getStateText(status.state)}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Device State:</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      status.state === 1 ? 'bg-green-400' : 
                      status.state === 0 ? 'bg-red-400' : 'bg-yellow-400'
                    }`}></div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStateColor(status.state)}`}>
                      {getStateText(status.state)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">ACC State:</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${status.accState === 1 ? 'bg-yellow-400' : 'bg-gray-400'}`}></div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getAccStateColor(status.accState)}`}>
                      {getAccStateText(status.accState)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <p className="font-medium text-gray-900 mt-1">
                        {status.state === 1 ? 'Connected' : 'Disconnected'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Power:</span>
                      <p className="font-medium text-gray-900 mt-1">
                        {status.accState === 1 ? 'Engine On' : 'Engine Off'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <span>Last updated: {new Date().toLocaleTimeString()}</span>
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-1 ${
                      status.state === 1 ? 'bg-green-400 animate-pulse' : 
                      status.state === 0 ? 'bg-red-400' : 'bg-yellow-400'
                    }`}></div>
                    <span>{
                      status.state === 1 ? 'Live' : 
                      status.state === 0 ? 'Offline' : 'Low Power'
                    }</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceStatus;
