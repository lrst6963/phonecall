<template>
  <div class="video-grid" v-if="hasAnyVideo">
    <div
      v-for="user in usersWithVideo"
      :key="'video_grid_' + user.id"
      class="video-grid-item"
    >
      <div :id="'video_container_' + user.id" class="user-video-container"></div>
      <div class="video-user-label">
        <img v-if="user.avatar" :src="user.avatar" class="user-avatar-small" alt="" />
        <span class="voice-indicator" v-show="userVolumes[user.id] > 0.05">
          <span class="voice-bar"></span><span class="voice-bar"></span><span class="voice-bar"></span>
        </span>
        {{ formatRoomUserLabel(user) }}
      </div>
      <button class="video-fullscreen-btn" @click="toggleFullscreen('video_container_' + user.id)" title="全屏">
        <span class="material-symbols-outlined">fullscreen</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RoomUser } from '../types'

defineProps<{
  hasAnyVideo: boolean
  usersWithVideo: RoomUser[]
  formatRoomUserLabel: (user: RoomUser) => string
  userVolumes: Record<string, number>
}>()

const toggleFullscreen = (containerId: string) => {
  const container = document.getElementById(containerId)
  if (!container) return

  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.warn(`Error attempting to enable fullscreen: ${err.message}`)
    })
  } else {
    document.exitFullscreen()
  }
}
</script>

<style scoped>
/* 语音发声动画 */
.voice-indicator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 12px;
  margin-right: 4px;
  vertical-align: middle;
}
.voice-bar {
  width: 2px;
  background-color: #fff;
  border-radius: 2px;
  animation: voice-bounce 0.5s infinite alternate ease-in-out;
}
.voice-bar:nth-child(1) { height: 50%; animation-delay: 0s; }
.voice-bar:nth-child(2) { height: 100%; animation-delay: 0.15s; }
.voice-bar:nth-child(3) { height: 75%; animation-delay: 0.3s; }

@keyframes voice-bounce {
  from { transform: scaleY(0.3); }
  to { transform: scaleY(1); }
}
</style>
