<script setup lang="ts">
import { computed } from 'vue'
import { useNetworkStatus } from '@synckit-js/sdk/vue'

const { status, connected } = useNetworkStatus({ pollInterval: 5000 })

const statusText = computed(() => {
  if (!status.value) return 'Offline Mode'
  return connected.value ? 'Connected' : 'Disconnected'
})

const statusColor = computed(() => {
  if (!status.value) return '#6b7280'
  return connected.value ? '#10b981' : '#ef4444'
})

const connectionState = computed(() => {
  return status.value?.connectionState || 'offline'
})

const queueSize = computed(() => {
  return status.value?.queueSize || 0
})
</script>

<template>
  <div class="status-bar">
    <div class="status-content">
      <div class="status-indicator">
        <div
          class="status-dot"
          :style="{ background: statusColor }"
          :class="{ pulse: connected }"
        ></div>
        <span class="status-text">{{ statusText }}</span>
      </div>

      <div class="status-details">
        <span class="detail-item">
          <span class="detail-label">Connection:</span>
          <span class="detail-value">{{ connectionState }}</span>
        </span>

        <span v-if="queueSize > 0" class="detail-item">
          <span class="detail-label">Queue:</span>
          <span class="detail-value">{{ queueSize }} pending</span>
        </span>
      </div>

      <div class="info-text">
        💡 This demo uses IndexedDB storage. Changes persist across tabs and page refreshes.
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  padding: 0.75rem 2rem;
}

.status-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 2rem;
  font-size: 0.9rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: background 0.3s;
}

.status-dot.pulse {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.status-text {
  font-weight: 600;
  color: #374151;
}

.status-details {
  display: flex;
  gap: 1.5rem;
  color: #6b7280;
}

.detail-item {
  display: flex;
  gap: 0.5rem;
}

.detail-label {
  font-weight: 500;
}

.detail-value {
  color: #374151;
}

.info-text {
  margin-left: auto;
  color: #6b7280;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .status-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .info-text {
    margin-left: 0;
  }
}
</style>
