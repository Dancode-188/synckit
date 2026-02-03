/**
 * Contribution Stats Component
 * Real-time dashboard showing words contributed per collaborator
 */

import { useState } from 'react';

export interface ContributorData {
  clientId: string;
  userName: string;
  userColor: string;
  wordsAdded: number;
  editsCount: number;
}

interface ContributionStatsProps {
  contributors: ContributorData[];
  localStats: { wordsAdded: number; editsCount: number };
  localUserName: string;
  localUserColor: string;
}

export function ContributionStats({
  contributors,
  localStats,
  localUserName,
  localUserColor,
}: ContributionStatsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Combine local user with remote contributors
  const allContributors: ContributorData[] = [
    {
      clientId: 'local',
      userName: `${localUserName} (you)`,
      userColor: localUserColor,
      wordsAdded: localStats.wordsAdded,
      editsCount: localStats.editsCount,
    },
    ...contributors,
  ];

  // Sort by words added (descending)
  const sortedContributors = [...allContributors].sort(
    (a, b) => b.wordsAdded - a.wordsAdded
  );

  // Check if there are any contributions
  const hasContributions = sortedContributors.some((c) => c.wordsAdded > 0 || c.editsCount > 0);

  // Calculate totals
  const totalWords = sortedContributors.reduce((sum, c) => sum + c.wordsAdded, 0);
  const totalUsers = sortedContributors.filter((c) => c.wordsAdded > 0 || c.editsCount > 0).length;

  if (!hasContributions) {
    return null;
  }

  return (
    <div className="fixed top-20 right-4 z-40">
      {/* Compact badge */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
      >
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {totalWords} words
        </span>
        {totalUsers > 1 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            by {totalUsers} users
          </span>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden animate-scale-in">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Contributions
            </h3>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {sortedContributors.map((contributor, index) => (
              <div
                key={contributor.clientId}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                {/* Avatar dot */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: contributor.userColor }}
                />

                {/* Name and stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {contributor.userName}
                    </span>
                    {/* Crown for top contributor */}
                    {index === 0 && contributor.wordsAdded > 0 && (
                      <span className="animate-crown-bounce">👑</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {contributor.wordsAdded} words • {contributor.editsCount} edits
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
