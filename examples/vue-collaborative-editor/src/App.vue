<script setup lang="ts">
import { onMounted } from 'vue'
import { SyncKit } from '@synckit-js/sdk'
import { provideSyncKit } from '@synckit-js/sdk/vue'
import Editor from './components/Editor.vue'
import PresenceBar from './components/PresenceBar.vue'
import StatusBar from './components/StatusBar.vue'

// Initialize SyncKit
const synckit = new SyncKit({
  name: 'vue-collaborative-editor',
  storage: 'memory' // Use memory storage for demo
})

// Provide SyncKit to all child components
provideSyncKit(synckit)

onMounted(async () => {
  await synckit.init()
  console.log('SyncKit initialized')
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>Vue Collaborative Editor</h1>
      <p class="subtitle">Built with SyncKit Vue Adapter</p>
    </header>

    <PresenceBar document-id="demo-doc" />

    <main class="app-main">
      <Editor document-id="demo-doc" />
    </main>

    <StatusBar />
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
</style>
