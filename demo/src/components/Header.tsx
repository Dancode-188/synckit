/**
 * Header component
 * Simplified navigation header for the demo
 */

import { useTheme } from '../contexts/ThemeContext';
import { navigateToStage, type AppRoute } from '../lib/rooms';

interface HeaderProps {
  isConnected?: boolean;
  route: AppRoute;
  roomId?: string | null;
}

export function Header({ isConnected = false, route, roomId }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        {/* Left: Back + Logo */}
        <div className="flex items-center gap-3">
          {route !== 'stage' && (
            <button
              onClick={navigateToStage}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Back to stage"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-bold">L</span>
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              LocalWrite
            </h1>
          </div>
        </div>

        {/* Center: Route indicator */}
        <div className="hidden sm:flex items-center gap-2">
          {route === 'room' && roomId && (
            <div className="flex items-center gap-2 px-3 py-1 bg-primary-50 dark:bg-primary-900/30 rounded-full">
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                Room {roomId}
              </span>
            </div>
          )}
          {route === 'playground' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Playground
              </span>
            </div>
          )}
          {route === 'wordwall' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 rounded-full">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Word Wall
              </span>
            </div>
          )}
        </div>

        {/* Right: Status + Theme */}
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
