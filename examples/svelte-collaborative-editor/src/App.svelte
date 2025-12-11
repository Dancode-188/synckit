<script lang="ts">
  import { onMount } from 'svelte';
  import { SyncKit } from '@synckit-js/sdk';
  import { setSyncKitContext } from '@synckit-js/sdk/svelte';
  import Editor from './components/Editor.svelte';
  import PresenceBar from './components/PresenceBar.svelte';
  import StatusBar from './components/StatusBar.svelte';

  // Initialize SyncKit
  const synckit = new SyncKit({
    name: 'svelte-collaborative-editor',
    storage: 'indexeddb' // Use IndexedDB for cross-tab sync
  });

  // Track initialization state
  let isInitialized = $state(false);

  // Provide SyncKit to all child components
  setSyncKitContext(synckit);

  onMount(async () => {
    try {
      await synckit.init();
      isInitialized = true;
      console.log('SyncKit initialized');
    } catch (error) {
      console.error('Failed to initialize SyncKit:', error);
    }
  });
</script>

<div class="app">
  <header class="app-header">
    <h1>Svelte Collaborative Editor</h1>
    <p class="subtitle">Built with SyncKit Svelte Adapter</p>
  </header>

  {#if !isInitialized}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>Initializing SyncKit...</p>
    </div>
  {:else}
    <PresenceBar documentId="demo-doc" />

    <main class="app-main">
      <Editor documentId="demo-doc" />
    </main>

    <StatusBar />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f5f5f5;
  }

  .app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .app-header h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
  }

  .subtitle {
    margin: 0.5rem 0 0;
    font-size: 1.1rem;
    opacity: 0.9;
  }

  .app-main {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 2rem;
  }

  .loading-overlay {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #666;
    font-size: 1.1rem;
  }

  .loading-overlay .spinner {
    width: 50px;
    height: 50px;
    border: 5px solid #f3f3f3;
    border-top: 5px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
