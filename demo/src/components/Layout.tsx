/**
 * Layout component
 * Main application layout with header, sidebar, and editor
 */

import { ReactNode } from 'react';
import { Header } from './Header';
import type { AppRoute } from '../lib/rooms';

interface LayoutProps {
  isConnected?: boolean;
  route: AppRoute;
  roomId?: string | null;
  sidebar: ReactNode | null;
  children: ReactNode;
}

export function Layout({ isConnected, route, roomId, sidebar, children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <Header isConnected={isConnected} route={route} roomId={roomId} />

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
