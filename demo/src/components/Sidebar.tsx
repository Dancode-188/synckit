/**
 * Sidebar component
 * Displays list of pages/documents
 */

import { UI_CONFIG } from '../lib/constants';

interface Page {
  id: string;
  title: string;
  icon: string;
  updatedAt?: Date;
}

interface SidebarProps {
  pages: Page[];
  currentPageId?: string;
  onPageSelect: (pageId: string) => void;
  onNewPage: () => void;
}

export function Sidebar({ pages, currentPageId, onPageSelect, onNewPage }: SidebarProps) {
  return (
    <aside
      className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col"
      style={{ width: UI_CONFIG.sidebarWidth }}
    >
      {/* Sidebar header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={onNewPage}
          className="w-full px-4 py-2 bg-primary-500 hover:bg-primary-600 hover:scale-105 active:scale-95 text-white rounded-lg font-medium text-sm transition-all duration-150 shadow-sm hover:shadow-md"
        >
          + New Page
        </button>
      </div>

      {/* Pages list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {pages.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No pages yet. Click "New Page" to create one.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => onPageSelect(page.id)}
                className={`w-full text-left px-3 py-2 rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 ${
                  currentPageId === page.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{page.icon}</span>
                  <span className="flex-1 text-sm font-medium truncate">
                    {page.title}
                  </span>
                </div>
                {page.updatedAt && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
                    {formatRelativeTime(page.updatedAt)}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Pages:</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{pages.length}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
