/**
 * Layout component
 * Main application layout with header, sidebar, and editor
 */

import { ReactNode } from 'react';
import { Header } from './Header';
import type { AppRoute } from '../lib/rooms';

interface LayoutProps {
  isConnected?: boolean;
  pendingOps?: number;
  route: AppRoute;
  roomId?: string | null;
  sidebar: ReactNode | null;
  children: ReactNode;
  onOpenHelp?: () => void;
}

export function Layout({ isConnected, pendingOps = 0, route, roomId, sidebar, children, onOpenHelp }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <Header isConnected={isConnected} pendingOps={pendingOps} route={route} roomId={roomId} onOpenHelp={onOpenHelp} />

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
