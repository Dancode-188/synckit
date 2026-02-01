/**
 * Stage - Live landing page
 *
 * The first thing visitors see. Shows live room stats,
 * room cards, and action buttons for joining/creating rooms.
 */

import { useState, useEffect, useRef } from 'react';
import { ROOM_CAPACITY, pickBestRoom, type RoomInfo } from '../lib/sharding';
import {
  generateRoomId,
  navigateToRoom,
  navigateToWordWall,
  navigateToPlayground,
} from '../lib/rooms';
import { FEATURES } from '../lib/features';

// Derive the HTTP base URL from the WebSocket server URL
const SERVER_URL = 'https://synckit-localwrite.fly.dev';
const POLL_INTERVAL = 3000;

interface RoomStats {
  rooms: RoomInfo[];
  totalConnections: number;
  totalRooms: number;
  wordwall: { id: string; subscriberCount: number; lastModified: number } | null;
}

interface StageProps {
  isConnected: boolean;
}

export function Stage({ isConnected }: StageProps) {
  const [stats, setStats] = useState<RoomStats | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const prevStatsRef = useRef<RoomStats | null>(null);

  // Poll /rooms endpoint
  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/rooms`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted) {
          prevStatsRef.current = stats;
          setStats(data);
          setFetchError(false);
        }
      } catch {
        if (mounted) setFetchError(true);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleAutoJoin = () => {
    if (stats) {
      const bestRoom = pickBestRoom(stats.rooms);
      if (bestRoom) {
        navigateToRoom(bestRoom);
        return;
      }
    }
    // No rooms or all full — create a new one
    navigateToRoom(generateRoomId());
  };

  const handleCreateRoom = () => {
    navigateToRoom(generateRoomId());
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 dark:from-gray-900 dark:to-gray-950">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary-500/30">
            L
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            LocalWrite
          </h1>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
          Real-time collaborative editing powered by CRDTs
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Built with <span className="font-medium text-primary-600 dark:text-primary-400">SyncKit</span> — local-first sync that just works
        </p>

        {/* Connection indicator */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500 dark:text-gray-500">
            {isConnected ? 'Connected to server' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Live Stats */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <div className="flex flex-wrap justify-center gap-6">
          <StatCard
            label="People online"
            value={stats?.totalConnections ?? 0}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <StatCard
            label="Active rooms"
            value={stats?.totalRooms ?? 0}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
          />
          {FEATURES.WORD_WALL && stats?.wordwall && (
            <StatCard
              label="On word wall"
              value={stats.wordwall.subscriberCount}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              }
            />
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="max-w-4xl mx-auto px-4 pb-10">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleAutoJoin}
            disabled={!isConnected}
            className="w-full sm:w-auto px-6 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white rounded-xl font-semibold text-lg transition-colors shadow-lg shadow-primary-500/25"
          >
            Join a Room
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={!isConnected}
            className="w-full sm:w-auto px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl font-semibold transition-colors border border-gray-200 dark:border-gray-700"
          >
            Create Private Room
          </button>
          {FEATURES.WORD_WALL && (
            <button
              onClick={navigateToWordWall}
              disabled={!isConnected}
              className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-400 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-amber-500/25"
            >
              Word Wall
            </button>
          )}
          <button
            onClick={navigateToPlayground}
            disabled={!isConnected}
            className="w-full sm:w-auto px-5 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors text-sm font-medium"
          >
            Open Playground
          </button>
        </div>
      </div>

      {/* Room Cards */}
      {stats && stats.rooms.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-16">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 text-center">
            Active Rooms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onJoin={() => navigateToRoom(room.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats && stats.rooms.length === 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-16 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No active rooms yet. Be the first to create one.
          </p>
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div className="max-w-4xl mx-auto px-4 pb-8 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Could not reach server for live stats
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 pb-8 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Powered by SyncKit &mdash; Fugue CRDT + WASM + WebSocket
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl px-6 py-4 shadow-sm border border-gray-100 dark:border-gray-700 min-w-[140px] text-center">
      <div className="flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 transition-all duration-300">
        {value}
      </div>
    </div>
  );
}

function RoomCard({
  room,
  onJoin,
}: {
  room: RoomInfo;
  onJoin: () => void;
}) {
  const isFull = room.subscriberCount >= ROOM_CAPACITY;
  const capacityPercent = Math.min(
    (room.subscriberCount / ROOM_CAPACITY) * 100,
    100
  );
  const isActive =
    Date.now() - room.lastModified < 30000; // Active in last 30s

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
            {room.id}
          </span>
          {isActive && (
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        {isFull && (
          <span className="text-xs font-medium text-red-500 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
            Full
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {room.subscriberCount}/{ROOM_CAPACITY} people
        </span>
      </div>

      {/* Capacity bar */}
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-3">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${
            isFull
              ? 'bg-red-500'
              : capacityPercent > 75
                ? 'bg-amber-500'
                : 'bg-primary-500'
          }`}
          style={{ width: `${capacityPercent}%` }}
        />
      </div>

      <button
        onClick={onJoin}
        disabled={isFull}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
          isFull
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-primary-500 hover:bg-primary-600 text-white'
        }`}
      >
        {isFull ? 'Room Full' : 'Join'}
      </button>
    </div>
  );
}
