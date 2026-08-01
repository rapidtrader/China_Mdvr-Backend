import { useState, useEffect } from 'react';
import DeviceCard from './DeviceCard';
import { apiUrl } from '../api';

const Dashboard = () => {
  const [devices, setDevices] = useState([]);
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
    fetchDevices(storedToken);
  }, []);

  const fetchDevices = async (authToken) => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(apiUrl('/api/devices'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        // Handle both response shapes:
        // { data: { data: { list: [] } } }  — external API
        // { data: { list: [] } }             — mock/db data
        const list =
          data.data?.data?.list ||
          data.data?.list ||
          [];
        setDevices(list);
        console.log('Devices fetched:', data.data);
      } else {
        setError(data.message || 'Failed to fetch devices');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Device fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHmi32Latest = async () => {
    try {
      setHmi32Error('');
      const response = await fetch(apiUrl('/api/hmi32/latest'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        setHmi32Error(data.message || 'Failed to fetch HMI32 data');
        setHmi32Latest([]);
        return;
      }

      const rows = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
      setHmi32Latest(rows);
    } catch (err) {
      setHmi32Error('Failed to fetch HMI32 data');
      setHmi32Latest([]);
      console.error('HMI32 fetch error:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.location.reload();
  };

  const handleRefresh = () => {
    if (token) {
      fetchDevices(token);
    }
    fetchHmi32Latest();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 sm:mt-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 sm:py-6 space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-black">MDVR Device Dashboard</h1>
              <p className="text-black mt-1 text-sm sm:text-base">Manage and monitor your devices</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleRefresh}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded flex items-center text-sm sm:text-base"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
                <span className="sm:hidden">Reload</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Devices</dt>
                    <dd className="text-lg font-medium text-gray-900">{devices.length}</dd>
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
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Devices</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {devices.filter(device => device.state === 0).length}
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Last Updated</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {new Date().toLocaleTimeString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>



        {/* Device Grid */}
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Device List</h2>
          {devices.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No devices found</h3>
              <p className="mt-1 text-sm text-gray-500">No devices are currently available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {devices.map((device) => (
                <DeviceCard key={device.deviceId} device={device} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
