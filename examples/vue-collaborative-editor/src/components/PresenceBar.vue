<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { usePresence, useSelf } from '@synckit-js/sdk/vue'

interface Props {
  documentId: string
}

const props = defineProps<Props>()

// User colors for presence
const COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#6366F1', '#8B5CF6', '#EC4899', '#F97316'
]

const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

// Track presence
const { self, others, otherCount, updatePresence } = usePresence(props.documentId, {
  initialState: {
    user: {
      name: `User ${Math.floor(Math.random() * 1000)}`,
      color: getRandomColor()
    }
  }
})

// Local state for name editing
const isEditingName = ref(false)
const editName = ref('')

const userName = computed(() => {
  return (self.value?.state.user as any)?.name || 'Anonymous'
})

const userColor = computed(() => {
  return (self.value?.state.user as any)?.color || '#6B7280'
})

const startEditingName = () => {
  editName.value = userName.value
  isEditingName.value = true
}

const saveName = async () => {
  if (editName.value.trim()) {
    await updatePresence({
      user: {
        name: editName.value.trim(),
        color: userColor.value
      }
    })
  }
  isEditingName.value = false
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
</script>

<template>
  <div class="presence-bar">
    <div class="presence-content">
      <div class="presence-section">
        <h3 class="presence-title">Online Users ({{ otherCount + 1 }})</h3>
      </div>

      <div class="users-list">
        <!-- Self -->
        <div class="user-badge self" :style="{ background: userColor }">
          <span class="user-initials">{{ getInitials(userName) }}</span>
          <div class="user-tooltip">
            <div v-if="!isEditingName" class="user-info">
              <span class="user-name">{{ userName }} (You)</span>
              <button @click="startEditingName" class="edit-name-btn">
                ✏️ Edit
              </button>
            </div>
            <div v-else class="name-editor">
              <input
                v-model="editName"
                type="text"
                placeholder="Your name"
                class="name-input"
                @keyup.enter="saveName"
                @keyup.esc="isEditingName = false"
                autofocus
              />
              <button @click="saveName" class="save-name-btn">✓</button>
            </div>
          </div>
        </div>

        <!-- Others -->
        <div
          v-for="user in others"
          :key="user.client_id"
          class="user-badge"
          :style="{ background: (user.state.user as any)?.color || '#6B7280' }"
        >
          <span class="user-initials">
            {{ getInitials((user.state.user as any)?.name || 'User') }}
          </span>
          <div class="user-tooltip">
            <span class="user-name">{{ (user.state.user as any)?.name || 'Anonymous' }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="otherCount === 0" class="empty-users">
          <span class="empty-text">
            No other users online. Open in another tab to test!
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.presence-bar {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 1rem 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.presence-content {
  max-width: 1400px;
  margin: 0 auto;
}

.presence-section {
  margin-bottom: 0.75rem;
}

.presence-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.users-list {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.user-badge {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-badge.self {
  border: 2px solid #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.user-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.user-initials {
  user-select: none;
}

.user-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 0.5rem;
  background: #1f2937;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 10;
}

.user-badge:hover .user-tooltip {
  opacity: 1;
  pointer-events: auto;
}

.user-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1f2937;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-name {
  font-weight: 500;
}

.edit-name-btn {
  background: transparent;
  border: none;
  color: white;
  padding: 0.25rem;
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.edit-name-btn:hover {
  opacity: 1;
}

.name-editor {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.name-input {
  background: white;
  color: #1f2937;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  width: 120px;
}

.save-name-btn {
  background: #10b981;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s;
}

.save-name-btn:hover {
  background: #059669;
}

.empty-users {
  padding: 0.5rem 1rem;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px dashed #d1d5db;
}

.empty-text {
  font-size: 0.9rem;
  color: #6b7280;
  font-style: italic;
}
</style>
