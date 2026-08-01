import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../api';

const LoginForm = ({ onBack }) => {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
    if (success) setSuccess('');
  };

  const extractLoginMessage = (payload) => {
    const candidates = [
      payload?.message,
      payload?.error?.message,
      payload?.error?.msg,
      payload?.data?.message,
      payload?.data?.msg,
      typeof payload?.error === 'string' ? payload.error : null
    ].filter(Boolean);

    return candidates[0] || 'Login failed';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        setError(extractLoginMessage(data));
        return;
      }

      if (data.success) {
        setSuccess('Login successful!');
        
        // Debug: Log the full response structure
        console.log('Full login response:', JSON.stringify(data, null, 2));
        console.log('Response type:', typeof data);
        console.log('Has data property:', 'data' in data);
        console.log('Data property type:', typeof data.data);
        console.log('Data property:', data.data);
        
        // Extract token from response - check all possible locations
        let authToken = null;
        
        // Check the structure based on your API response
        if (data && data.data && typeof data.data === 'object' && data.data.token) {
          authToken = data.data.token;
          console.log('Found token at data.data.token:', authToken);
        } else if (data && data.token) {
          authToken = data.token;
          console.log('Found token at data.token:', authToken);
        } else if (data && data.data && data.data.data && data.data.data.token) {
          authToken = data.data.data.token;
          console.log('Found token at data.data.data.token:', authToken);
        }
        
        // Log all possible token locations for debugging
        console.log('Token locations check:');
        console.log('- data.data?.data?.token:', data?.data?.data?.token);
        console.log('- data.data?.token:', data?.data?.token);
        console.log('- data.token:', data?.token);
        console.log('- data.data keys:', data?.data ? Object.keys(data.data) : 'no data.data');
        console.log('- data keys:', data ? Object.keys(data) : 'no data');
        
        if (authToken) {
          login(authToken);
          console.log('Login successful, token stored:', authToken);
        } else {
          setError('Login successful but no token received');
          console.log('No token found in any expected location');
        }
      } else {
        setError(extractLoginMessage(data));
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div>
          <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            MDVR Login System
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 sm:py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 text-base sm:text-sm"
                placeholder="Username"
                value={formData.username}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                autoComplete="current-password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 sm:py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 text-base sm:text-sm"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{success}</span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
        
              </div>
    </div>
  );
};

export default LoginForm;
