/**
 * Header component
 * Simplified navigation header for the demo
 */

import { useTheme } from '../contexts/ThemeContext';
import { navigateToStage, type AppRoute } from '../lib/rooms';

interface HeaderProps {
  isConnected?: boolean;
  pendingOps?: number;
  route: AppRoute;
  roomId?: string | null;
  onOpenHelp?: () => void;
}

export function Header({ isConnected = false, pendingOps = 0, route, roomId, onOpenHelp }: HeaderProps) {
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

        {/* Right: Status + Links + Theme */}
        <div className="flex items-center gap-2">
          {/* Sync status indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div className={`w-2 h-2 rounded-full ${
              !isConnected
                ? 'bg-gray-400'
                : pendingOps > 0
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-green-500'
            }`} />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
              {!isConnected
                ? 'Offline'
                : pendingOps > 0
                  ? `Syncing (${pendingOps})`
                  : 'Synced'}
            </span>
          </div>

          {/* GitHub link */}
          <a
            href="https://github.com/Dancode-188/synckit"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="View on GitHub"
            title="View SyncKit on GitHub"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>

          {/* Help button */}
          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Open help"
              title="Help & Documentation (Press ?)"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

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
