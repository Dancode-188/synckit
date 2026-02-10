/**
 * Export Dialog
 * Provides options to export current page or all pages to markdown/JSON
 */

import { useState } from 'react';
import { SyncKit } from '@synckit-js/sdk';
import { Block, PageDocument, parseBlockOrder } from '../lib/blocks';
import { exportPageToMarkdown, exportPageToJSON, downloadFile, sanitizeFilename } from '../lib/export';

interface Page {
  id: string;
  title: string;
  icon: string;
}

interface ExportDialogProps {
  synckit: SyncKit | null;
  currentPageId?: string;
  currentPageTitle?: string;
  currentPageIcon?: string;
  allPages: Page[];
  onClose: () => void;
}

export function ExportDialog({
  synckit,
  currentPageId,
  currentPageTitle,
  currentPageIcon,
  allPages,
  onClose,
}: ExportDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');

  const handleExportCurrentMarkdown = async () => {
    if (!synckit || !currentPageId || !currentPageTitle || !currentPageIcon) {
      alert('No page currently open');
      return;
    }

    try {
      setExporting(true);
      const doc = synckit.document<PageDocument>(currentPageId);
      await doc.init();
      const data = await doc.get();

      const blockIds = parseBlockOrder((data.blockOrder as string) || '[]');
      const blocks: Block[] = [];

      for (const blockId of blockIds) {
        const block = (data as any)[`block:${blockId}`];
        if (block) {
          blocks.push(block);
        }
      }

      const markdown = exportPageToMarkdown(currentPageTitle, currentPageIcon, blocks);
      const filename = `${sanitizeFilename(currentPageTitle)}.md`;
      downloadFile(filename, markdown, 'text/markdown');
      setExportStatus(`Exported "${currentPageTitle}" as markdown`);
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('Export failed - check console');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCurrentJSON = async () => {
    if (!synckit || !currentPageId || !currentPageTitle || !currentPageIcon) {
      alert('No page currently open');
      return;
    }

    try {
      setExporting(true);
      const doc = synckit.document<PageDocument>(currentPageId);
      await doc.init();
      const data = await doc.get();

      const blockIds = parseBlockOrder((data.blockOrder as string) || '[]');
      const blocks: Block[] = [];

      for (const blockId of blockIds) {
        const block = (data as any)[`block:${blockId}`];
        if (block) {
          blocks.push(block);
        }
      }

      const json = exportPageToJSON(
        currentPageId,
        currentPageTitle,
        currentPageIcon,
        blocks,
        data.createdAt as number,
        data.updatedAt as number
      );
      const filename = `${sanitizeFilename(currentPageTitle)}.json`;
      downloadFile(filename, json, 'application/json');
      setExportStatus(`Exported "${currentPageTitle}" as JSON`);
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('Export failed - check console');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAllMarkdown = async () => {
    if (!synckit || allPages.length === 0) {
      alert('No pages to export');
      return;
    }

    setExporting(true);
    setExportStatus('Exporting all pages...');

    try {
      let combinedMarkdown = `# LocalWrite Export\n\n`;
      combinedMarkdown += `Exported: ${new Date().toLocaleString()}\n`;
      combinedMarkdown += `Total pages: ${allPages.length}\n\n`;
      combinedMarkdown += `---\n\n`;

      for (const page of allPages) {
        const doc = synckit.document<PageDocument>(page.id);
        await doc.init();
        const data = await doc.get();

        const blockIds = parseBlockOrder((data.blockOrder as string) || '[]');
        const blocks: Block[] = [];

        for (const blockId of blockIds) {
          const block = (data as any)[`block:${blockId}`];
          if (block) {
            blocks.push(block);
          }
        }

        combinedMarkdown += exportPageToMarkdown(page.title, page.icon, blocks);
        combinedMarkdown += `\n---\n\n`;
      }

      downloadFile('localwrite_export.md', combinedMarkdown, 'text/markdown');
      setExportStatus(`Exported ${allPages.length} pages as markdown`);
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('Export failed - check console');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAllJSON = async () => {
    if (!synckit || allPages.length === 0) {
      alert('No pages to export');
      return;
    }

    setExporting(true);
    setExportStatus('Exporting all pages...');

    try {
      const exportData = {
        exportedAt: Date.now(),
        exportedBy: 'LocalWrite',
        version: '1.0',
        pageCount: allPages.length,
        pages: [] as any[],
      };

      for (const page of allPages) {
        const doc = synckit.document<PageDocument>(page.id);
        await doc.init();
        const data = await doc.get();

        const blockIds = parseBlockOrder((data.blockOrder as string) || '[]');
        const blocks: Block[] = [];

        for (const blockId of blockIds) {
          const block = (data as any)[`block:${blockId}`];
          if (block) {
            blocks.push(block);
          }
        }

        exportData.pages.push({
          id: page.id,
          title: page.title,
          icon: page.icon,
          blocks,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      }

      const json = JSON.stringify(exportData, null, 2);
      downloadFile('localwrite_export.json', json, 'application/json');
      setExportStatus(`Exported ${allPages.length} pages as JSON`);
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('Export failed - check console');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 dark:bg-opacity-50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-6 animate-scale-in">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Export Pages
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Download your content as markdown or JSON
              </p>
            </div>
          </div>

          {/* Export options */}
          <div className="space-y-3 mb-6">
            {/* Current page exports */}
            {currentPageId && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Current Page: {currentPageIcon} {currentPageTitle}
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCurrentMarkdown}
                    disabled={exporting}
                    className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Markdown
                  </button>
                  <button
                    onClick={handleExportCurrentJSON}
                    disabled={exporting}
                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    JSON
                  </button>
                </div>
              </div>
            )}

            {/* All pages exports */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                All Pages ({allPages.length} total)
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={handleExportAllMarkdown}
                  disabled={exporting}
                  className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? 'Exporting...' : 'Markdown'}
                </button>
                <button
                  onClick={handleExportAllJSON}
                  disabled={exporting}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? 'Exporting...' : 'JSON'}
                </button>
              </div>
            </div>
          </div>

          {/* Status message */}
          {exportStatus && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                ✓ {exportStatus}
              </p>
            </div>
          )}

          {/* Close button */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              disabled={exporting}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
