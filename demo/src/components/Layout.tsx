/**
 * Layout component
 * Main application layout with header, sidebar, and editor
 */

import { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  storageType?: 'opfs' | 'indexeddb';
  isConnected?: boolean;
  sidebar: ReactNode;
  children: ReactNode;
}

export function Layout({ storageType, isConnected, sidebar, children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <Header storageType={storageType} isConnected={isConnected} />

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
