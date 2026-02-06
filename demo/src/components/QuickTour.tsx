/**
 * QuickTour - In-room feature highlights
 *
 * Lightweight tooltip sequence highlighting key editor features.
 * Shows only on first room visit, easily dismissible, can be replayed.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'localwrite-tour-seen';

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '.editor-container',
    title: 'Start Typing',
    description: 'Type anywhere to create content. Your changes sync automatically across all connected devices.',
    position: 'bottom',
  },
  {
    target: '[data-tour="slash-menu"]',
    title: 'Formatting Commands',
    description: 'Type "/" to open the slash menu for headings, lists, and more.',
    position: 'right',
  },
  {
    target: '[data-tour="cursors"]',
    title: 'Real-time Collaboration',
    description: 'See other users\' cursors and selections in real-time. Each user has a unique color.',
    position: 'bottom',
  },
  {
    target: '[data-tour="sync-status"]',
    title: 'Sync Status',
    description: 'This indicator shows your connection status. All changes are saved locally and synced when online.',
    position: 'left',
  },
];

interface QuickTourProps {
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function QuickTour({ isActive, onComplete, onSkip }: QuickTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Calculate tooltip position based on target element
  useEffect(() => {
    if (!isActive || !step) return;

    const calculatePosition = () => {
      const target = document.querySelector(step.target);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (step.position) {
        case 'bottom':
          top = rect.bottom + 16;
          left = rect.left + rect.width / 2;
          break;
        case 'top':
          top = rect.top - 16;
          left = rect.left + rect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - 16;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + 16;
          break;
      }

      setTooltipPosition({ top, left });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [isActive, step]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onComplete();
  };

  const handleSkipTour = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onSkip();
  };

  if (!isActive || !step) return null;

  return (
    <>
      {/* Backdrop (subtle) */}
      <div className="fixed inset-0 bg-black/10 z-40 animate-in fade-in duration-200" />

      {/* Tooltip */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-4 max-w-xs animate-in fade-in zoom-in-95 duration-200"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          transform: step.position === 'bottom' || step.position === 'top'
            ? 'translateX(-50%)'
            : step.position === 'left'
              ? 'translate(-100%, -50%)'
              : 'translateY(-50%)',
        }}
      >
        {/* Progress indicator */}
        <div className="flex items-center gap-1 mb-2">
          {TOUR_STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-1 flex-1 rounded-full ${
                index <= currentStep
                  ? 'bg-primary-500'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {step.title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {step.description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleSkipTour}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <button
              onClick={handleNext}
              className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isLastStep ? 'Got it!' : 'Next'}
            </button>
          </div>
        </div>

        {/* Arrow pointer */}
        <div
          className={`absolute w-3 h-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rotate-45 ${
            step.position === 'bottom'
              ? 'border-t border-l -top-1.5 left-1/2 -translate-x-1/2'
              : step.position === 'top'
                ? 'border-b border-r -bottom-1.5 left-1/2 -translate-x-1/2'
                : step.position === 'left'
                  ? 'border-r border-b -right-1.5 top-1/2 -translate-y-1/2'
                  : 'border-l border-t -left-1.5 top-1/2 -translate-y-1/2'
          }`}
        />
      </div>
    </>
  );
}

/**
 * Hook to check if tour should be shown
 */
export function useShouldShowTour(): boolean {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    setShouldShow(!seen);
  }, []);

  return shouldShow;
}

/**
 * Function to reset tour (for replay)
 */
export function resetTour(): void {
  localStorage.removeItem(STORAGE_KEY);
}
