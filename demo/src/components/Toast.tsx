/**
 * Toast Component
 * Displays toast notifications with animations
 */

import { useToast } from '../contexts/ToastContext';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            animate-toast-slide-in
            flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
            min-w-[280px] max-w-[400px]
            ${toast.variant === 'celebration'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
            }
          `}
          onClick={() => removeToast(toast.id)}
        >
          {toast.icon && (
            <span className="text-2xl flex-shrink-0">{toast.icon}</span>
          )}
          <span className="font-medium">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
