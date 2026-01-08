/**
 * Memory Monitor Component
 * Tracks memory usage in development mode and alerts on potential leaks
 */

import { useState, useEffect } from 'react';

interface MemorySample {
  timestamp: number;
  usedMB: number;
}

export function MemoryMonitor() {
  const [samples, setSamples] = useState<MemorySample[]>([]);
  const [currentMemory, setCurrentMemory] = useState<number>(0);
  const [trend, setTrend] = useState<number>(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Only run in development mode
    if (import.meta.env.PROD) return;

    // Check if performance.memory is available (Chrome only)
    if (!('memory' in performance)) {
      console.warn('⚠️ performance.memory not available (Chrome only feature)');
      return;
    }

    const interval = setInterval(() => {
      const memory = (performance as any).memory;
      if (!memory) return;

      const usedMB = memory.usedJSHeapSize / 1024 / 1024;
      const sample: MemorySample = {
        timestamp: Date.now(),
        usedMB,
      };

      setSamples((prev) => {
        const newSamples = [...prev, sample];
        // Keep last 60 samples (1 hour if sampling every minute)
        if (newSamples.length > 60) {
          newSamples.shift();
        }
        return newSamples;
      });

      setCurrentMemory(usedMB);

      // Calculate trend (MB per minute)
      setSamples((currentSamples) => {
        if (currentSamples.length < 10) return currentSamples;

        const oldest = currentSamples[currentSamples.length - 10];
        const newest = currentSamples[currentSamples.length - 1];

        const timeDiff = (newest.timestamp - oldest.timestamp) / 1000 / 60; // minutes
        const memoryDiff = newest.usedMB - oldest.usedMB;
        const calculatedTrend = memoryDiff / timeDiff;

        setTrend(calculatedTrend);

        // Alert on memory leak (growing >1 MB/min)
        if (calculatedTrend > 1) {
          console.warn(
            `⚠️ Possible memory leak detected: ${calculatedTrend.toFixed(2)} MB/min growth`
          );
        }

        // Alert on high memory (>200 MB)
        if (usedMB > 200) {
          console.warn(`⚠️ High memory usage: ${usedMB.toFixed(2)} MB`);
        }

        return currentSamples;
      });
    }, 60000); // Sample every minute

    // Also sample immediately
    const memory = (performance as any).memory;
    if (memory) {
      const usedMB = memory.usedJSHeapSize / 1024 / 1024;
      setCurrentMemory(usedMB);
      setSamples([{ timestamp: Date.now(), usedMB }]);
    }

    return () => clearInterval(interval);
  }, []);

  // Don't render in production
  if (import.meta.env.PROD) return null;

  // Don't render if memory API not available
  if (!('memory' in performance)) return null;

  const trendColor =
    trend > 1 ? 'text-red-500' : trend > 0.5 ? 'text-yellow-500' : 'text-green-500';
  const memoryColor = currentMemory > 200 ? 'text-red-500' : 'text-gray-600 dark:text-gray-400';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          className="bg-gray-900 dark:bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg text-xs font-mono hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
          title="Show memory monitor"
        >
          📊 {currentMemory.toFixed(0)} MB
        </button>
      ) : (
        <div className="bg-gray-900 dark:bg-gray-800 text-white p-4 rounded-lg shadow-lg min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <span>📊</span>
              Memory Monitor
            </h3>
            <button
              onClick={() => setIsCollapsed(true)}
              className="text-gray-400 hover:text-white text-xs"
              title="Collapse"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-gray-400">Current:</span>
              <span className={memoryColor}>{currentMemory.toFixed(2)} MB</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">Trend:</span>
              <span className={trendColor}>
                {trend > 0 ? '+' : ''}
                {trend.toFixed(2)} MB/min
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">Samples:</span>
              <span className="text-gray-300">{samples.length}</span>
            </div>

            {trend > 1 && (
              <div className="mt-3 pt-3 border-t border-red-500/30">
                <div className="text-xs text-red-400 flex items-start gap-2">
                  <span>⚠️</span>
                  <span>Memory leak detected! Check console for details.</span>
                </div>
              </div>
            )}

            {currentMemory > 200 && (
              <div className="mt-3 pt-3 border-t border-yellow-500/30">
                <div className="text-xs text-yellow-400 flex items-start gap-2">
                  <span>⚠️</span>
                  <span>High memory usage. Consider refreshing.</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="text-[10px] text-gray-500">
              Dev mode only • Chrome only
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
