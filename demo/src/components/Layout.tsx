/**
 * Layout component
 * Main application layout with header, sidebar, and editor
 */

import { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  storageType?: 'opfs' | 'indexeddb';
  isConnected?: boolean;
  sidebar: ReactNode | null;
  children: ReactNode;
  onSearchClick?: () => void;
  onExportClick?: () => void;
  onCreateRoom?: () => void;
}

export function Layout({ storageType, isConnected, sidebar, children, onSearchClick, onExportClick, onCreateRoom }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <Header storageType={storageType} isConnected={isConnected} onSearchClick={onSearchClick} onExportClick={onExportClick} onCreateRoom={onCreateRoom} />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebar}

        {/* Editor/Content area */}
        {children}
      </div>
    </div>
  );
}
