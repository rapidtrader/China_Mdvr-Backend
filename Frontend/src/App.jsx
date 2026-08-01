import { useState } from 'react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import GpsData from './components/GpsData';
import DeviceStatus from './components/DeviceStatus';
import LiveVideo from './components/LiveVideo';
import Sidebar from './components/Sidebar';
import Hmi32Monitor from './components/Hmi32Monitor';
import MachineInfoPage from './components/MachineInfoPage';
import ReportsPage from './components/ReportsPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';

// Tabs jo bina login ke accessible hain
const PUBLIC_TABS = ['hmi32-monitor', 'machine-info', 'reports'];

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('hmi32-monitor');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // MDVR tabs ke liye login required
  const handleTabChange = (tab) => {
    if (!PUBLIC_TABS.includes(tab) && !isAuthenticated) {
      setShowLogin(true);
      return;
    }
    setActiveTab(tab);
    setShowLogin(false);
  };

  // Login form show karo
  if (showLogin && !isAuthenticated) {
    return <LoginForm onBack={() => setShowLogin(false)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'hmi32-monitor':
        return <Hmi32Monitor />;
      case 'machine-info':
        return <MachineInfoPage />;
      case 'reports':
        return <ReportsPage />;
      // MDVR tabs — login required
      case 'dashboard':
        return isAuthenticated ? <Dashboard /> : <Hmi32Monitor />;
      case 'gps':
        return isAuthenticated ? <GpsData /> : <Hmi32Monitor />;
      case 'status':
        return isAuthenticated ? <DeviceStatus /> : <Hmi32Monitor />;
      case 'video':
        return isAuthenticated ? <LiveVideo /> : <Hmi32Monitor />;
      default:
        return <Hmi32Monitor />;
    }
  };

  return (
    <div className="flex h-screen bg-white relative">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-30">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-black">MDVR System</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAuthenticated={isAuthenticated}
        onLoginClick={() => setShowLogin(true)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-white lg:ml-0">
        <div className="pt-16 lg:pt-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
