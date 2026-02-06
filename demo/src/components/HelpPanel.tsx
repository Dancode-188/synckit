/**
 * HelpPanel - Persistent help sidebar
 *
 * Slide-out panel with quick tips, documentation links, and keyboard shortcuts.
 * Accessible from Header via "?" icon or "?" keyboard shortcut.
 */

import { useEffect } from 'react';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayTour?: () => void;
}

export function HelpPanel({ isOpen, onClose, onReplayTour }: HelpPanelProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Help & Resources
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close help panel"
          >
            <svg className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Quick Start */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">
              Quick Start
            </h3>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                <span>Open a room in two browser tabs to see real-time sync</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                <span>Type <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">/</code> for formatting commands</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                <span>See others' cursors and selections in real-time</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                <span>All edits sync automatically, even offline</span>
              </p>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">
              Keyboard Shortcuts
            </h3>
            <div className="space-y-2">
              <ShortcutRow shortcut="Ctrl/Cmd + B" description="Bold text" />
              <ShortcutRow shortcut="Ctrl/Cmd + I" description="Italic text" />
              <ShortcutRow shortcut="Ctrl/Cmd + K" description="Insert link" />
              <ShortcutRow shortcut="Ctrl/Cmd + Z" description="Undo" />
              <ShortcutRow shortcut="Ctrl/Cmd + Y" description="Redo" />
              <ShortcutRow shortcut="Shift + ?" description="Open this help panel" />
            </div>
          </section>

          {/* Tour */}
          {onReplayTour && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">
                Feature Tour
              </h3>
              <button
                onClick={() => {
                  onReplayTour();
                  onClose();
                }}
                className="w-full px-4 py-2 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
              >
                Replay Quick Tour
              </button>
            </section>
          )}

          {/* Documentation */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">
              Documentation
            </h3>
            <div className="space-y-2">
              <ExternalLink
                href="https://github.com/Dancode-188/synckit/blob/main/docs/guides/getting-started.md"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                }
              >
                Getting Started Guide
              </ExternalLink>
              <ExternalLink
                href="https://github.com/Dancode-188/synckit/blob/main/docs/api/SDK_API.md"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                }
              >
                API Reference
              </ExternalLink>
              <ExternalLink
                href="https://github.com/Dancode-188/synckit/blob/main/docs/architecture/ARCHITECTURE.md"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                }
              >
                Architecture Overview
              </ExternalLink>
            </div>
          </section>

          {/* About SyncKit */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">
              About SyncKit
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              SyncKit is a local-first sync SDK using Fugue CRDTs and WebAssembly for conflict-free real-time collaboration.
            </p>
            <a
              href="https://github.com/Dancode-188/synckit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              View on GitHub
            </a>
          </section>

          {/* Feedback */}
          <section className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Found a bug or have feedback?{' '}
              <a
                href="https://github.com/Dancode-188/synckit/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                Open an issue
              </a>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

// Helper components
function ShortcutRow({ shortcut, description }: { shortcut: string; description: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 dark:text-gray-400">{description}</span>
      <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-mono rounded border border-gray-200 dark:border-gray-600">
        {shortcut}
      </kbd>
    </div>
  );
}

function ExternalLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
    >
      <span className="text-gray-400 dark:text-gray-500 group-hover:text-primary-500 dark:group-hover:text-primary-400">
        {icon}
      </span>
      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-primary-600 dark:group-hover:text-primary-400">
        {children}
      </span>
      <svg className="w-3 h-3 ml-auto text-gray-400 group-hover:text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}
