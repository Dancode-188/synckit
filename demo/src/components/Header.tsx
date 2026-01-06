/**
 * Header component
 * Displays app title, connection status, and storage info
 */

import { useState, useEffect } from 'react';

interface HeaderProps {
  storageType?: 'opfs' | 'indexeddb';
  isConnected?: boolean;
}

export function Header({ storageType, isConnected = false }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-xl font-bold">L</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              LocalWrite
            </h1>
            <p className="text-xs text-gray-500">
              SyncKit v0.3.0
            </p>
          </div>
        </div>

        {/* Right: Status indicators */}
        <div className="flex items-center gap-4">
          {/* Storage indicator */}
          {storageType && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
              <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
              <span className="text-xs font-medium text-gray-700">
                {storageType === 'opfs' ? 'OPFS (Fast)' : 'IndexedDB'}
              </span>
            </div>
          )}

          {/* Connection indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <span className="text-xs font-medium text-gray-700">
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Current time */}
          <div className="text-xs text-gray-500">
            {currentTime.toLocaleTimeString()}
          </div>
        </div>
      </div>
    </header>
  );
}
