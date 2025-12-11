<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SyncKit } from '@synckit-js/sdk'
import { provideSyncKit } from '@synckit-js/sdk/vue'
import Editor from './components/Editor.vue'
import PresenceBar from './components/PresenceBar.vue'
import StatusBar from './components/StatusBar.vue'

// Initialize SyncKit
const synckit = new SyncKit({
  name: 'vue-collaborative-editor',
  storage: 'indexeddb' // Use IndexedDB for cross-tab sync
})

// Track initialization state
const isInitialized = ref(false)

// Provide SyncKit to all child components
provideSyncKit(synckit)

onMounted(async () => {
  try {
    await synckit.init()
    isInitialized.value = true
    console.log('SyncKit initialized')
  } catch (error) {
    console.error('Failed to initialize SyncKit:', error)
  }
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>Vue Collaborative Editor</h1>
      <p class="subtitle">Built with SyncKit Vue Adapter</p>
    </header>

    <div v-if="!isInitialized" class="loading-overlay">
      <div class="spinner"></div>
      <p>Initializing SyncKit...</p>
    </div>

    <template v-else>
      <PresenceBar document-id="demo-doc" />

      <main class="app-main">
        <Editor document-id="demo-doc" />
      </main>

      <StatusBar />
    </template>
  </div>
</template>

<style scoped>
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
