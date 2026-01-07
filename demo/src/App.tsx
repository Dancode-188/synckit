import { useState, useEffect } from 'react';
import { SyncKit } from '@synckit-js/sdk';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SearchDialog } from './components/SearchDialog';
import { SyncKitProvider } from './contexts/SyncKitContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { initializeSyncKit } from './lib/synckit';
import { StorageType } from './lib/storage';
import { createPage, PageDocument } from './lib/blocks';

interface Page {
  id: string;
  title: string;
  icon: string;
  updatedAt?: Date;
}

function App() {
  const [synckit, setSynckit] = useState<SyncKit | null>(null);
  const [storageType, setStorageType] = useState<StorageType | undefined>();
  const [isConnected] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | undefined>();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSubscriptions] = useState<Map<string, () => void>>(new Map());
  const [showSearchDialog, setShowSearchDialog] = useState(false);

  // Initialize SyncKit on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        console.log('🚀 Starting LocalWrite initialization...');

        // Initialize SyncKit
        const { synckit, storage } = await initializeSyncKit();

        if (!mounted) return;

        // Store synckit instance and storage type
        setSynckit(synckit);
        setStorageType(storage.type);

        // Load existing pages from storage
        const docIds = await storage.storage.list();
        console.log('📂 Found documents in storage:', docIds);

        // Filter out snapshot keys - they shouldn't be loaded as pages
        const pageIds = docIds.filter(id => !id.startsWith('snapshot:'));
        console.log('📄 Page documents (excluding snapshots):', pageIds);

        const loadedPages: Page[] = [];

        for (const docId of pageIds) {
          // Load document data directly from storage
          const storedDoc = await storage.storage.get(docId);
          console.log(`  Loading ${docId}:`, storedDoc);

          if (storedDoc && storedDoc.data) {
            const data = storedDoc.data as any;
            console.log(`    Data:`, data);

            if (data.title) {
              // This is a page document
              loadedPages.push({
                id: docId,
                title: data.title || 'Untitled',
                icon: data.icon || '📄',
                updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
              });
              console.log(`    ✅ Added page: ${data.title}`);
            } else {
              console.log(`    ⚠️ Skipping (no title field)`);
            }
          } else {
            console.log(`    ⚠️ No data found for ${docId}`);
          }
        }

        // Sort by updatedAt (newest first)
        loadedPages.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
        setPages(loadedPages);

        // Subscribe to all loaded pages for sidebar updates
        // Use local Map to prevent race conditions with cleanup
        if (!mounted) return;

        const newSubscriptions = new Map<string, () => void>();

        for (const page of loadedPages) {
          // Check mounted status on each iteration
          if (!mounted) break;

          const doc = synckit.document<PageDocument>(page.id);
          const unsubscribe = doc.subscribe((data) => {
            if (!mounted) return;
            setPages((prevPages) =>
              prevPages.map((p) =>
                p.id === page.id
                  ? {
                      ...p,
                      title: (data.title as string) || 'Untitled',
                      icon: (data.icon as string) || '📄',
                      updatedAt: data.updatedAt
                        ? new Date(data.updatedAt as number)
                        : p.updatedAt,
                    }
                  : p
              )
            );
          });
          newSubscriptions.set(page.id, unsubscribe);
        }

        // Final mounted check before committing subscriptions
        if (!mounted) {
          // Clean up subscriptions we just created
          newSubscriptions.forEach((unsub) => unsub());
          return;
        }

        // Only now add to shared Map
        newSubscriptions.forEach((unsub, id) => {
          pageSubscriptions.set(id, unsub);
        });

        setIsInitializing(false);
        console.log(`✅ LocalWrite initialized successfully (${loadedPages.length} pages loaded)`);
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
      // Cleanup all page subscriptions
      pageSubscriptions.forEach((unsub) => unsub());
      pageSubscriptions.clear();
    };
  }, []); // Empty deps - this should run once on mount

  // Keyboard shortcut for search (Cmd/Ctrl+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setShowSearchDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle new page creation
  const handleNewPage = async () => {
    if (!synckit) return;

    // Create page data
    const pageData = createPage();
    console.log('📝 Creating new page:', pageData.id, pageData);

    // Initialize the document in SyncKit
    const doc = synckit.document<PageDocument>(pageData.id);

    // CRITICAL: Initialize document for persistence
    await doc.init();
    console.log('  Document initialized');

    // Set all page data (MUST await each set call for persistence)
    for (const [key, value] of Object.entries(pageData)) {
      console.log(`  Setting ${key}:`, value);
      await doc.set(key as any, value);
    }

    console.log('✅ Page created and saved to SyncKit');

    // Create simple page entry for sidebar
    const newPage: Page = {
      id: pageData.id,
      title: pageData.title,
      icon: pageData.icon,
      updatedAt: new Date(pageData.createdAt),
    };

    // Use functional form to avoid stale closure
    setPages((prevPages) => [newPage, ...prevPages]);
    setCurrentPageId(newPage.id);

    // Subscribe to title changes for sidebar updates
    const unsubscribe = doc.subscribe((data) => {
      setPages((prevPages) =>
        prevPages.map((p) =>
          p.id === pageData.id
            ? {
                ...p,
                title: (data.title as string) || 'Untitled',
                icon: (data.icon as string) || '📄',
                updatedAt: data.updatedAt
                  ? new Date(data.updatedAt as number)
                  : p.updatedAt,
              }
            : p
        )
      );
    });

    // Store subscription for cleanup
    pageSubscriptions.set(pageData.id, unsubscribe);

    console.log('Subscription active for:', pageData.id);
  };

  // Handle page selection
  const handlePageSelect = (pageId: string) => {
    setCurrentPageId(pageId);
  };

  // Handle page deletion
  const handleDeletePage = async (pageId: string) => {
    if (!synckit) return;

    try {
      // Unsubscribe from page updates
      const unsubscribe = pageSubscriptions.get(pageId);
      if (unsubscribe) {
        unsubscribe();
        pageSubscriptions.delete(pageId);
      }

      // Delete from storage
      const storage = (synckit as any).storage;
      if (storage) {
        await storage.delete(pageId);
        console.log(`🗑️ Deleted page: ${pageId}`);
      }

      // Remove from pages list and switch page if needed
      if (currentPageId === pageId) {
        // Need to switch to another page
        setPages((prevPages) => {
          const remainingPages = prevPages.filter((p) => p.id !== pageId);
          // Switch to first remaining page or clear
          setCurrentPageId(remainingPages.length > 0 ? remainingPages[0].id : undefined);
          return remainingPages;
        });
      } else {
        // Just remove from list
        setPages((prevPages) => prevPages.filter((p) => p.id !== pageId));
      }
    } catch (error) {
      console.error('Failed to delete page:', error);
      alert('Failed to delete page. Please try again.');
    }
  };

  // Get current page data
  const currentPage = pages.find(p => p.id === currentPageId);

  // Loading state
  if (isInitializing) {
    return (
      <ThemeProvider>
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">Initializing LocalWrite...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Setting up OPFS storage and SyncKit client</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Error state
  if (error) {
    return (
      <ThemeProvider>
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Initialization Failed</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Wait for SyncKit to be ready
  if (!synckit || !storageType) {
    return null; // This should never happen since we check isInitializing above
  }

  return (
    <ThemeProvider>
      <SyncKitProvider synckit={synckit} storageType={storageType}>
        <Layout
          storageType={storageType}
          isConnected={isConnected}
          onSearchClick={() => setShowSearchDialog(true)}
          sidebar={
            <Sidebar
              pages={pages}
              currentPageId={currentPageId}
              onPageSelect={handlePageSelect}
              onNewPage={handleNewPage}
              onDeletePage={handleDeletePage}
            />
          }
        >
          <Editor
            pageId={currentPageId}
            pageTitle={currentPage?.title}
            pageIcon={currentPage?.icon}
          />
        </Layout>

        {/* Search Dialog */}
        {showSearchDialog && (
          <SearchDialog
            synckit={synckit}
            pages={pages}
            onNavigate={handlePageSelect}
            onClose={() => setShowSearchDialog(false)}
          />
        )}
      </SyncKitProvider>
    </ThemeProvider>
  );
}

export default App
