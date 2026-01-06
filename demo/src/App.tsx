import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { initializeSyncKit } from './lib/synckit';
import { StorageType } from './lib/storage';

interface Page {
  id: string;
  title: string;
  icon: string;
  updatedAt?: Date;
}

function App() {
  const [storageType, setStorageType] = useState<StorageType | undefined>();
  const [isConnected] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | undefined>();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize SyncKit on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        console.log('🚀 Starting LocalWrite initialization...');

        // Initialize SyncKit
        const { synckit, storage } = await initializeSyncKit();

        if (!mounted) return;

        // Set storage type from initialization
        setStorageType(storage.type);

        // TODO: Store synckit instance in state/context for later use
        console.log('SyncKit ready:', synckit);

        setIsInitializing(false);
        console.log('✅ LocalWrite initialized successfully');
      } catch (err) {
        console.error('❌ Failed to initialize LocalWrite:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsInitializing(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Handle new page creation
  const handleNewPage = () => {
    const newPage: Page = {
      id: `page-${Date.now()}`,
      title: 'Untitled',
      icon: '📄',
      updatedAt: new Date(),
    };
    setPages([newPage, ...pages]);
    setCurrentPageId(newPage.id);
  };

  // Handle page selection
  const handlePageSelect = (pageId: string) => {
    setCurrentPageId(pageId);
  };

  // Get current page data
  const currentPage = pages.find(p => p.id === currentPageId);

  // Loading state
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Initializing LocalWrite...</p>
          <p className="text-sm text-gray-500 mt-2">Setting up OPFS storage and SyncKit client</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Initialization Failed</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout
      storageType={storageType}
      isConnected={isConnected}
      sidebar={
        <Sidebar
          pages={pages}
          currentPageId={currentPageId}
          onPageSelect={handlePageSelect}
          onNewPage={handleNewPage}
        />
      }
    >
      <Editor
        pageId={currentPageId}
        pageTitle={currentPage?.title}
        pageIcon={currentPage?.icon}
      />
    </Layout>
  );
}

export default App
