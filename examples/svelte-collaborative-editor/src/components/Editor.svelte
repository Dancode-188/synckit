<script lang="ts">
  import { onMount } from 'svelte';
  import { untrack } from 'svelte';
  import { getSyncKitContext, syncDocument } from '@synckit-js/sdk/svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  // Get SyncKit instance from context
  const synckit = getSyncKitContext();

  // Get document store for reactive display using Svelte 4 subscription pattern
  // Use untrack() since documentId won't change after mount
  const store = untrack(() => syncDocument(synckit, documentId));

  // Get document instance for mutations
  const doc = untrack(() => synckit.document(documentId));

  // Track if document is ready
  let docReady = $state(false);

  // Reactive document data using store subscription
  let documentData = $state<Record<string, unknown>>({});
  let loading = $state(true);

  // Subscribe to store changes
  onMount(() => {
    // Initialize document asynchronously
    doc.init()
      .then(() => {
        docReady = true;
      })
      .catch((err) => {
        console.error('Failed to initialize document:', err);
      });

    // Subscribe to document changes
    const unsubscribe = store.subscribe((data) => {
      documentData = data || {};
      loading = store.loading;
    });

    return unsubscribe;
  });

  // Local editing state
  let isEditing = $state(false);
  let editTitle = $state('');
  let editContent = $state('');

  // Derived state from reactive documentData
  const hasContent = $derived((documentData?.title || documentData?.content) as boolean);
  const title = $derived((documentData?.title as string) || '');
  const content = $derived((documentData?.content as string) || '');

  function startEditing() {
    editTitle = title;
    editContent = content;
    isEditing = true;
  }

  async function saveChanges() {
    if (!docReady) {
      console.error('Document not ready yet');
      return;
    }

    try {
      // Update document data using the document instance
      await doc.set('title', editTitle);
      await doc.set('content', editContent);
    } catch (error) {
      console.error('Failed to save document:', error);
    }
    isEditing = false;
  }

  function cancelEditing() {
    isEditing = false;
  }
</script>

<div class="editor">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading document...</p>
    </div>
  {:else if !isEditing}
    <div class="view-mode">
      <div class="document-header">
        <h2>{title || 'Untitled Document'}</h2>
        <button onclick={startEditing} class="edit-btn">
          ✏️ Edit
        </button>
      </div>

      <div class="document-content">
        {#if !hasContent}
          <p class="empty-state">
            This document is empty. Click "Edit" to add content.
          </p>
        {:else}
          <div class="content-text">
            {content || 'No content yet...'}
          </div>
        {/if}
      </div>

      <div class="document-info">
        <p class="hint">
          💡 Tip: Open this page in multiple tabs to see real-time collaboration
        </p>
      </div>
    </div>
  {:else}
    <div class="edit-mode">
      <div class="form-group">
        <label for="title">Document Title</label>
        <input
          id="title"
          bind:value={editTitle}
          type="text"
          placeholder="Enter document title..."
          class="title-input"
        />
      </div>

      <div class="form-group">
        <label for="content">Content</label>
        <textarea
          id="content"
          bind:value={editContent}
          placeholder="Start typing..."
          class="content-textarea"
          rows="15"
        ></textarea>
      </div>

      <div class="button-group">
        <button onclick={saveChanges} class="save-btn">
          ✓ Save Changes
        </button>
        <button onclick={cancelEditing} class="cancel-btn">
          ✕ Cancel
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .editor {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    padding: 2rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: #666;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .view-mode,
  .edit-mode {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .document-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #f0f0f0;
  }

  .document-header h2 {
    margin: 0;
    font-size: 2rem;
    color: #333;
  }

  .edit-btn {
    background: #667eea;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .edit-btn:hover {
    background: #5568d3;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .document-content {
    flex: 1;
    margin-bottom: 2rem;
  }

  .empty-state {
    color: #999;
    font-style: italic;
    text-align: center;
    padding: 3rem;
  }

  .content-text {
    font-size: 1.1rem;
    line-height: 1.8;
    color: #444;
    white-space: pre-wrap;
  }

  .document-info {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid #f0f0f0;
  }

  .hint {
    color: #666;
    font-size: 0.9rem;
    margin: 0;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .title-input {
    width: 100%;
    padding: 0.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .title-input:focus {
    border-color: #667eea;
  }

  .content-textarea {
    width: 100%;
    padding: 1rem;
    font-size: 1.1rem;
    line-height: 1.6;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    resize: vertical;
    min-height: 300px;
    transition: all 0.2s;
  }

  .content-textarea:focus {
    border-color: #667eea;
  }

  .button-group {
    display: flex;
    gap: 1rem;
    margin-top: auto;
    padding-top: 1rem;
  }

  .save-btn {
    background: #10b981;
    color: white;
    border: none;
    padding: 0.75rem 2rem;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.2s;
    flex: 1;
  }

  .save-btn:hover {
    background: #059669;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .cancel-btn {
    background: #6b7280;
    color: white;
    border: none;
    padding: 0.75rem 2rem;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .cancel-btn:hover {
    background: #4b5563;
  }
</style>
