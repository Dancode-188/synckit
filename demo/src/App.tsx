import { useState, useEffect } from 'react';
import { SyncKit } from '@synckit-js/sdk';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SearchDialog } from './components/SearchDialog';
import { ExportDialog } from './components/ExportDialog';
import { MemoryMonitor } from './components/MemoryMonitor';
import { Cursors } from './components/Cursors';
import { RoomBanner } from './components/RoomBanner';
import { SyncKitProvider, useSyncKit } from './contexts/SyncKitContext';
import { getRoomIdFromUrl, roomToDocumentId, generateRoomId, navigateToRoom } from './lib/rooms';
import { ThemeProvider } from './contexts/ThemeContext';
import { initializeSyncKit } from './lib/synckit';
import { StorageType } from './lib/storage';
import { createPage, PageDocument, createBlock, BLOCK_TYPES } from './lib/blocks';
import { FEATURES } from './lib/features';
// import { getUserIdentity } from './lib/user'; // Will be used for live cursors

interface Page {
  id: string;
  title: string;
  icon: string;
  updatedAt?: Date;
}

// Inner component that uses SyncKit hooks
function AppContent({ storageType }: { storageType: StorageType }) {
  const { synckit } = useSyncKit();
  const [isConnected, setIsConnected] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string>('playground'); // Default to playground
  const [pageSubscriptions] = useState<Map<string, { unsubscribe: () => void; document: any }>>(new Map());
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  // Track connection status
  useEffect(() => {
    const checkConnection = () => {
      const status = synckit.getNetworkStatus();
      setIsConnected(status?.connectionState === 'connected');
    };

    // Check initial status
    checkConnection();

    // Poll for updates (since we don't have a subscription API)
    const interval = setInterval(checkConnection, 1000);

    return () => clearInterval(interval);
  }, [synckit]);

  // Check for room mode and initialize room document
  useEffect(() => {
    const checkRoom = async () => {
      const id = getRoomIdFromUrl();
      console.log('🔍 Checking room mode - Room ID from URL:', id);
      setRoomId(id);

      if (id) {
        // In room mode, initialize room document
        const roomDocId = roomToDocumentId(id);
        console.log('🚪 Room mode activated - Document ID:', roomDocId);

        // CRITICAL: Set the page ID immediately, before trying to initialize
        // This ensures the Editor switches to the room even if init times out
        console.log('📌 Setting current page ID to:', roomDocId);
        setCurrentPageId(roomDocId);

        try {
          // Get or create room document
          const doc = synckit.document<PageDocument>(roomDocId);
          await doc.init();

          // Check if document has content, if not initialize it
          const data = doc.get();
          const hasContent = data && Object.keys(data).length > 0;
          console.log('📊 Room document has content:', hasContent, 'Keys:', Object.keys(data || {}).length);

          if (!hasContent) {
            // Initialize with default page structure and first block
            const firstBlock = createBlock(BLOCK_TYPES.PARAGRAPH, '');

            await doc.set('id', roomDocId);
            await doc.set('title', 'Collaborative Room');
            await doc.set('icon', '🤝');
            await doc.set('blockOrder', JSON.stringify([firstBlock.id]));
            await doc.set(`block:${firstBlock.id}` as any, firstBlock);
            await doc.set('createdAt', Date.now());
            await doc.set('updatedAt', Date.now());
            console.log('✅ Initialized room document:', roomDocId);
          }
        } catch (error) {
          console.error('Failed to initialize room document:', error);
          // Continue anyway - the Editor will handle the initialization
        }
      } else {
        // Not in room mode - default to playground
        console.log('🌍 Not in room mode - defaulting to playground');
        setCurrentPageId('playground');
      }
    };

    checkRoom();

    // Listen for hash changes
    window.addEventListener('hashchange', checkRoom);
    return () => window.removeEventListener('hashchange', checkRoom);
  }, [synckit]);

  // Create new room
  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    navigateToRoom(newRoomId);
  };

  // Load pages from storage on mount (only if PERSONAL_PAGES feature enabled)
  useEffect(() => {
    // Skip if in room mode OR if personal pages feature is disabled
    if (roomId || !FEATURES.PERSONAL_PAGES) return;

    let mounted = true;

    async function loadPages() {
      try {
        const storage = (synckit as any).storage;
        if (!storage) return;

        // Load existing pages from storage
        const docIds = await storage.list();
        console.log('📂 Found documents in storage:', docIds);

        // Filter out snapshot keys and system documents
        const pageIds = docIds.filter((id: string) =>
          !id.startsWith('snapshot:') &&
          id !== 'playground' &&
          !id.startsWith('room:')
        );
        console.log('📄 Page documents (excluding snapshots):', pageIds);

        const loadedPages: Page[] = [];

        for (const docId of pageIds) {
          const storedDoc = await storage.get(docId);
          if (storedDoc && storedDoc.data) {
            const data = storedDoc.data as any;
            if (data.title) {
              loadedPages.push({
                id: docId,
                title: data.title || 'Untitled',
                icon: data.icon || '📄',
                updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
              });
            }
          }
        }

        // Sort by updatedAt (newest first)
        loadedPages.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));

        if (!mounted) return;
        setPages(loadedPages);

        // Subscribe to all loaded pages
        const newSubscriptions = new Map<string, { unsubscribe: () => void; document: any }>();

        for (const page of loadedPages) {
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
          newSubscriptions.set(page.id, { unsubscribe, document: doc });
        }

        if (!mounted) {
          newSubscriptions.forEach((sub) => {
            sub.unsubscribe();
            sub.document.dispose();
          });
          return;
        }

        newSubscriptions.forEach((sub, id) => {
          pageSubscriptions.set(id, sub);
        });

        console.log(`✅ Loaded ${loadedPages.length} pages`);
      } catch (error) {
        console.error('Failed to load pages:', error);
      }
    }

    loadPages();

    return () => {
      mounted = false;
      pageSubscriptions.forEach((sub) => {
        sub.unsubscribe();
        sub.document.dispose();
      });
      pageSubscriptions.clear();
    };
  }, [synckit, roomId]);

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
    // Create page data
    const pageData = createPage();
    console.log('📝 Creating new page:', pageData.id, pageData);

    // Initialize the document in SyncKit
    const doc = synckit.document<PageDocument>(pageData.id);

    // Initialize document for persistence
    await doc.init();
    console.log('  Document initialized');

    // Set all page data
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

    setPages((prevPages) => [newPage, ...prevPages]);
    setCurrentPageId(newPage.id);

    // Subscribe to title changes
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

    pageSubscriptions.set(pageData.id, { unsubscribe, document: doc });
    console.log('Subscription active for:', pageData.id);
  };

  // Handle page selection
  const handlePageSelect = (pageId: string) => {
    setCurrentPageId(pageId);
  };

  // Handle page deletion
  const handleDeletePage = async (pageId: string) => {
    try {
      // Unsubscribe and dispose
      const subscription = pageSubscriptions.get(pageId);
      if (subscription) {
        subscription.unsubscribe();
        subscription.document.dispose();
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
        setPages((prevPages) => {
          const remainingPages = prevPages.filter((p) => p.id !== pageId);
          setCurrentPageId(remainingPages.length > 0 ? remainingPages[0].id : 'playground');
          return remainingPages;
        });
      } else {
        setPages((prevPages) => prevPages.filter((p) => p.id !== pageId));
      }
    } catch (error) {
      console.error('Failed to delete page:', error);
      alert('Failed to delete page. Please try again.');
    }
  };

  // Get current page data
  const currentPage = pages.find(p => p.id === currentPageId);

  return (
    <>
      {/* Room Banner (only in room mode) */}
      {roomId && currentPageId && (
        <RoomBanner synckit={synckit} roomId={roomId} documentId={currentPageId} />
      )}

      <Layout
        storageType={storageType}
        isConnected={isConnected}
        onSearchClick={roomId ? undefined : (FEATURES.PERSONAL_PAGES ? () => setShowSearchDialog(true) : undefined)}
        onExportClick={roomId ? undefined : (FEATURES.PERSONAL_PAGES ? () => setShowExportDialog(true) : undefined)}
        onCreateRoom={handleCreateRoom}
        sidebar={
          // Only show sidebar if PERSONAL_PAGES feature is enabled AND not in room mode
          !roomId && FEATURES.PERSONAL_PAGES ? (
            <Sidebar
              pages={pages}
              currentPageId={currentPageId}
              onPageSelect={handlePageSelect}
              onNewPage={handleNewPage}
              onDeletePage={handleDeletePage}
            />
          ) : null
        }
      >
      <Editor
        pageId={currentPageId}
        pageTitle={currentPage?.title}
        pageIcon={currentPage?.icon}
      />

      {/* Search Dialog (not in room mode) */}
      {!roomId && showSearchDialog && (
        <SearchDialog
          synckit={synckit}
          pages={pages}
          onNavigate={handlePageSelect}
          onClose={() => setShowSearchDialog(false)}
        />
      )}

      {/* Export Dialog (not in room mode) */}
      {!roomId && showExportDialog && (
        <ExportDialog
          synckit={synckit}
          currentPageId={currentPageId}
          currentPageTitle={currentPage?.title}
          currentPageIcon={currentPage?.icon}
          allPages={pages}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {/* Memory Monitor (dev mode only) */}
      <MemoryMonitor />

      {/* Live Cursors */}
      <Cursors synckit={synckit} pageId={currentPageId} />
      </Layout>
    </>
  );
}

// Outer App component that initializes SyncKit
function App() {
  const [synckit, setSynckit] = useState<SyncKit | null>(null);
  const [storageType, setStorageType] = useState<StorageType | undefined>();
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

        // Store synckit instance and storage type
        setSynckit(synckit);
        setStorageType(storage.type);

        setIsInitializing(false);
        console.log(`✅ LocalWrite initialized successfully`);

        // Log connection status
        const networkStatus = synckit.getNetworkStatus();
        if (networkStatus) {
          console.log(`🔌 Server connection: ${networkStatus.connectionState}`);
        }
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

  // Loading state
  if (isInitializing) {
    return (
      <ThemeProvider>
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">Initializing LocalWrite...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Setting up OPFS storage and connecting to server...</p>
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
    return null;
  }

  return (
    <ThemeProvider>
      <SyncKitProvider synckit={synckit} storageType={storageType}>
        <AppContent storageType={storageType} />
      </SyncKitProvider>
    </ThemeProvider>
  );
}

export default App
