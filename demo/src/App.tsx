import { useState, useEffect } from 'react';
import { SyncKit } from '@synckit-js/sdk';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SearchDialog } from './components/SearchDialog';
import { ExportDialog } from './components/ExportDialog';
import { Cursors } from './components/Cursors';
import { RoomBanner } from './components/RoomBanner';
import { Stage } from './components/Stage';
import { WordWall } from './components/WordWall';
import { WelcomeModal, useShouldShowWelcome } from './components/WelcomeModal';
import { HelpPanel } from './components/HelpPanel';
import { QuickTour, resetTour } from './components/QuickTour';
import { SyncKitProvider, useSyncKit } from './contexts/SyncKitContext';
import {
  getRouteFromUrl,
  getRoomIdFromUrl,
  roomToDocumentId,
  isPrivateRoomUrl,
  type AppRoute,
} from './lib/rooms';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { initializeSyncKit } from './lib/synckit';
import { StorageType } from './lib/storage';
import { createPage, PageDocument, createBlock, BLOCK_TYPES } from './lib/blocks';
import { FEATURES } from './lib/features';

interface Page {
  id: string;
  title: string;
  icon: string;
  updatedAt?: Date;
}

// Inner component that uses SyncKit hooks
function AppContent() {
  const { synckit } = useSyncKit();
  const [isConnected, setIsConnected] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const [route, setRoute] = useState<AppRoute>(getRouteFromUrl());
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string>('playground');
  const [pageSubscriptions] = useState<Map<string, { unsubscribe: () => void; document: any }>>(new Map());
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  // UX improvements state
  const shouldShowWelcome = useShouldShowWelcome();
  // const shouldShowTour = useShouldShowTour(); // Disabled for now
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showQuickTour, setShowQuickTour] = useState(false);

  // Show welcome modal on mount if first visit
  useEffect(() => {
    if (shouldShowWelcome && route === 'stage') {
      setShowWelcomeModal(true);
    }
  }, [shouldShowWelcome, route]);

  // Tour disabled for now - needs proper element selectors
  // Can be manually triggered via Help Panel
  // useEffect(() => {
  //   if (shouldShowTour && route === 'room' && roomId) {
  //     const timer = setTimeout(() => setShowQuickTour(true), 1000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [shouldShowTour, route, roomId]);

  // Track connection and sync status
  useEffect(() => {
    const checkStatus = () => {
      const status = synckit.getNetworkStatus();
      setIsConnected(status?.connectionState === 'connected');
      setPendingOps(status?.queueSize ?? 0);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 500);
    return () => clearInterval(interval);
  }, [synckit]);

  // Route detection via hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getRouteFromUrl());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Room initialization when route changes
  useEffect(() => {
    const initRoute = async () => {
      const id = getRoomIdFromUrl();
      setRoomId(id);

      if (route === 'room' && id) {
        const isPrivate = isPrivateRoomUrl();
        const roomDocId = roomToDocumentId(id, isPrivate);
        setCurrentPageId(roomDocId);

        try {
          const doc = synckit.document<PageDocument>(roomDocId);
          await doc.init();

          const data = doc.get();
          const hasContent = data && Object.keys(data).length > 0;

          if (!hasContent) {
            const firstBlock = createBlock(BLOCK_TYPES.PARAGRAPH, '');
            await doc.set('id', roomDocId);
            await doc.set('title', 'Collaborative Room');
            await doc.set('icon', '🤝');
            await doc.set('blockOrder', JSON.stringify([firstBlock.id]));
            await doc.set(`block:${firstBlock.id}` as any, firstBlock);
            await doc.set('createdAt', Date.now());
            await doc.set('updatedAt', Date.now());
          }
        } catch (error) {
          console.error('Failed to initialize room document:', error);
        }
      } else if (route === 'playground') {
        setCurrentPageId('playground');
      }
    };

    initRoute();
  }, [route, synckit]);

  // Load pages from storage on mount (only if PERSONAL_PAGES feature enabled)
  useEffect(() => {
    if (roomId || !FEATURES.PERSONAL_PAGES) return;

    let mounted = true;

    async function loadPages() {
      try {
        const storage = (synckit as any).storage;
        if (!storage) return;

        const docIds = await storage.list();
        const pageIds = docIds.filter((id: string) =>
          !id.startsWith('snapshot:') &&
          id !== 'playground' &&
          !id.startsWith('room:')
        );

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

        loadedPages.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));

        if (!mounted) return;
        setPages(loadedPages);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search (Cmd/Ctrl+P)
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setShowSearchDialog(true);
      }
      // Help (Shift+?)
      if (e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShowHelpPanel(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle new page creation
  const handleNewPage = async () => {
    const pageData = createPage();
    const doc = synckit.document<PageDocument>(pageData.id);
    await doc.init();

    for (const [key, value] of Object.entries(pageData)) {
      await doc.set(key as any, value);
    }

    const newPage: Page = {
      id: pageData.id,
      title: pageData.title,
      icon: pageData.icon,
      updatedAt: new Date(pageData.createdAt),
    };

    setPages((prevPages) => [newPage, ...prevPages]);
    setCurrentPageId(newPage.id);

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
  };

  const handlePageSelect = (pageId: string) => {
    setCurrentPageId(pageId);
  };

  const handleDeletePage = async (pageId: string) => {
    try {
      const subscription = pageSubscriptions.get(pageId);
      if (subscription) {
        subscription.unsubscribe();
        subscription.document.dispose();
        pageSubscriptions.delete(pageId);
      }

      const storage = (synckit as any).storage;
      if (storage) {
        await storage.delete(pageId);
      }

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
    }
  };

  const currentPage = pages.find(p => p.id === currentPageId);

  // =========================================================================
  // Route-based rendering
  // =========================================================================

  // Stage landing page
  if (route === 'stage') {
    return (
      <>
        <Stage isConnected={isConnected} />
        {showWelcomeModal && (
          <WelcomeModal onClose={() => setShowWelcomeModal(false)} />
        )}
        <HelpPanel
          isOpen={showHelpPanel}
          onClose={() => setShowHelpPanel(false)}
        />
      </>
    );
  }

  // Word Wall
  if (route === 'wordwall') {
    return (
      <>
        <Layout
          isConnected={isConnected}
          pendingOps={pendingOps}
          route={route}
          roomId={null}
          sidebar={null}
          onOpenHelp={() => setShowHelpPanel(true)}
        >
          <WordWall isConnected={isConnected} />
        </Layout>
        <HelpPanel
          isOpen={showHelpPanel}
          onClose={() => setShowHelpPanel(false)}
        />
      </>
    );
  }

  // Room or Playground editor view
  return (
    <>
      {route === 'room' && roomId && currentPageId && (
        <RoomBanner synckit={synckit} roomId={roomId} documentId={currentPageId} />
      )}

      <Layout
        isConnected={isConnected}
        pendingOps={pendingOps}
        route={route}
        roomId={roomId}
        onOpenHelp={() => setShowHelpPanel(true)}
        sidebar={
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

        {!roomId && showSearchDialog && (
          <SearchDialog
            synckit={synckit}
            pages={pages}
            onNavigate={handlePageSelect}
            onClose={() => setShowSearchDialog(false)}
          />
        )}

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

        <Cursors synckit={synckit} pageId={currentPageId} />
      </Layout>

      {/* Help Panel */}
      <HelpPanel
        isOpen={showHelpPanel}
        onClose={() => setShowHelpPanel(false)}
        onReplayTour={() => {
          resetTour();
          setShowQuickTour(true);
        }}
      />

      {/* Quick Tour */}
      <QuickTour
        isActive={showQuickTour}
        onComplete={() => setShowQuickTour(false)}
        onSkip={() => setShowQuickTour(false)}
      />
    </>
  );
}

// Outer App component that initializes SyncKit
function App() {
  const [synckit, setSynckit] = useState<SyncKit | null>(null);
  const [storageType, setStorageType] = useState<StorageType | undefined>();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { synckit, storage } = await initializeSyncKit();

        if (!mounted) return;

        setSynckit(synckit);
        setStorageType(storage.type);
        setIsInitializing(false);
      } catch (err) {
        console.error('Failed to initialize LocalWrite:', err);
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

  if (isInitializing) {
    return (
      <ThemeProvider>
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">Initializing LocalWrite...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (error) {
    return (
      <ThemeProvider>
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center max-w-md">
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

  if (!synckit || !storageType) {
    return null;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <SyncKitProvider synckit={synckit} storageType={storageType}>
          <AppContent />
          <ToastContainer />
        </SyncKitProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App
