/**
 * SyncKit Context
 * Provides SyncKit instance and storage info throughout the app
 */

import { createContext, useContext, ReactNode } from 'react';
import { SyncKit } from '@synckit-js/sdk';
import { StorageType } from '../lib/storage';

interface SyncKitContextValue {
  synckit: SyncKit;
  storageType: StorageType;
}

const SyncKitContext = createContext<SyncKitContextValue | null>(null);

interface SyncKitProviderProps {
  synckit: SyncKit;
  storageType: StorageType;
  children: ReactNode;
}

export function SyncKitProvider({ synckit, storageType, children }: SyncKitProviderProps) {
  return (
    <SyncKitContext.Provider value={{ synckit, storageType }}>
      {children}
    </SyncKitContext.Provider>
  );
}

export function useSyncKit() {
  const context = useContext(SyncKitContext);
  if (!context) {
    throw new Error('useSyncKit must be used within SyncKitProvider');
  }
  return context;
}
