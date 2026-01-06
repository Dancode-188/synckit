/**
 * Editor component
 * Main document editor area
 */

import { UI_CONFIG } from '../lib/constants';

interface EditorProps {
  pageId?: string;
  pageTitle?: string;
  pageIcon?: string;
}

export function Editor({ pageId, pageTitle = 'Untitled', pageIcon = '📄' }: EditorProps) {
  if (!pageId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to LocalWrite
          </h2>
          <p className="text-gray-600 mb-6">
            Create a new page to start writing, or select an existing page from the sidebar.
          </p>
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
            <p className="text-sm text-primary-900">
              <strong>Features:</strong> Real-time collaboration, automatic snapshots,
              OPFS storage, and lazy loading for optimal performance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="mx-auto py-12 px-8" style={{ maxWidth: UI_CONFIG.maxContentWidth }}>
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <button className="text-4xl hover:bg-gray-100 rounded p-1 transition-colors">
              {pageIcon}
            </button>
            <input
              type="text"
              value={pageTitle}
              className="flex-1 text-4xl font-bold text-gray-900 bg-transparent border-none outline-none focus:outline-none"
              placeholder="Untitled"
            />
          </div>
        </div>

        {/* Editor content - placeholder for now */}
        <div className="space-y-2">
          <div className="text-gray-400 text-lg">
            Click here to start writing...
          </div>
        </div>
      </div>
    </div>
  );
}
