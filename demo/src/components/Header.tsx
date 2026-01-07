/**
 * Header component
 * Displays app title, connection status, and storage info
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderProps {
  storageType?: 'opfs' | 'indexeddb';
  isConnected?: boolean;
  onSearchClick?: () => void;
}

export function Header({ storageType, isConnected = false, onSearchClick }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-xl font-bold">L</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              LocalWrite
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              SyncKit v0.3.0
            </p>
          </div>
        </div>

        {/* Center: Search */}
        {onSearchClick && (
          <div className="flex-1 flex justify-center px-8">
            <button
              onClick={onSearchClick}
              className="w-full max-w-md px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center gap-3 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm text-gray-500 dark:text-gray-400">Search pages...</span>
              <div className="ml-auto flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono text-gray-600 dark:text-gray-300">
                  {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                </kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono text-gray-600 dark:text-gray-300">P</kbd>
              </div>
            </button>
          </div>
        )}

        {/* Right: Status indicators */}
        <div className="flex items-center gap-4">
          {/* Storage indicator */}
          {storageType && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
              <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {storageType === 'opfs' ? 'OPFS (Fast)' : 'IndexedDB'}
              </span>
            </div>
          )}

          {/* Connection indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-110 active:scale-95 transition-all duration-150"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* Current time */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {currentTime.toLocaleTimeString()}
          </div>
        </div>
      </div>
    </header>
  );
}
