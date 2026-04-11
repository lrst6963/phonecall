<template>
  <div class="app-wrapper" :class="{ 'in-room': isInRoom }">
    <!-- 加入频道视图 -->
    <div v-if="!isInRoom" class="card-container login-container" style="max-width: 400px;">
      <h1>加入频道</h1>
      <div class="form-group">
        <md-outlined-text-field
          label="输入频道密码"
          type="password"
          :value="roomKey"
          @input="roomKey = $event.target.value"
          @keyup.enter="joinRoom"
        ></md-outlined-text-field>
      </div>
      <div style="text-align: right; margin-top: 24px;">
        <md-filled-button @click="joinRoom" :disabled="isConnecting">
          {{ isConnecting ? '连接中...' : '进入频道' }}
        </md-filled-button>
      </div>
    </div>

    <!-- 频道内部视图 -->
    <div v-else class="card-container room-container">
      <div class="header-flex">
        <h1>Web 通话</h1>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="badge">{{ userCount }} 人在线</span>
          <md-icon-button @click="toggleLogs" aria-label="查看日志" :class="{ 'active': showLogs }">
            <span class="material-symbols-outlined">receipt_long</span>
          </md-icon-button>
          <md-icon-button @click="leaveRoom" aria-label="退出频道">
            <span class="material-symbols-outlined">logout</span>
          </md-icon-button>
        </div>
      </div>
      
      <div class="room-content">
        <div class="room-sidebar">
          <div class="ip-list">
            <div class="ip-list-title">当前在线 IP:</div>
            <div v-if="currentRoomUsers.length === 0" class="ip-item" style="color: var(--md-sys-color-outline);">暂无其他用户</div>
            <div v-for="(user, index) in currentRoomUsers" :key="index" class="ip-item">
              <span class="ip-item-address">{{ user.ip }}</span>
              <span class="ip-item-status" :class="getStatusColorClass(user.status)">
                ({{ user.status }})
              </span>
            </div>
          </div>

          <div class="controls-container">
            <!-- 扬声器静音按钮 -->
            <md-icon-button
              @click="toggleMute"
              class="mute-btn"
              :aria-label="isMuted ? '取消静音' : '静音'"
            >
              <span class="material-symbols-outlined">
                {{ isMuted ? 'volume_off' : 'volume_up' }}
              </span>
            </md-icon-button>

            <!-- 麦克风主按钮 -->
            <div class="mic-btn-wrapper">
              <md-filled-icon-button 
                v-if="showCallBtn"
                :disabled="isCallBtnDisabled"
                @click="toggleCall"
                class="mic-btn"
                :class="{ 'mic-active': isCalling }"
                :aria-label="callBtnText"
              >
                <span class="material-symbols-outlined">
                  {{ isCalling ? 'mic_off' : 'mic' }}
                </span>
              </md-filled-icon-button>

              <md-filled-tonal-icon-button 
                v-if="showRequestTalkBtn"
                :disabled="isRequestTalkBtnDisabled"
                @click="requestTalk"
                class="mic-btn"
                :aria-label="requestTalkBtnText"
              >
                <span class="material-symbols-outlined">
                  {{ isRequestingTalk ? 'hourglass_empty' : 'waving_hand' }}
                </span>
              </md-filled-tonal-icon-button>
            </div>
            
            <!-- 占位元素保持居中平衡 -->
            <div class="controls-spacer"></div>
          </div>
        </div>

        <!-- 聊天区域 -->
        <div class="room-chat">
          <div class="chat-container">
            <div class="chat-messages" ref="chatMessagesContainer">
              <div
                v-for="msg in chatMessages"
                :key="msg.id"
                class="chat-message"
                :class="{
                  'chat-message-self': msg.senderId === clientId,
                  'chat-message-image-only': isImageLikeMessage(msg) && !msg.revoked
                }"
                @contextmenu.prevent="openMessageMenu($event, msg)"
                @touchstart="startMessageLongPress($event, msg)"
                @touchend="cancelMessageLongPress"
                @touchmove="cancelMessageLongPress"
                @touchcancel="cancelMessageLongPress"
              >
                <div class="chat-message-header">
                  <span class="chat-sender">{{ msg.senderId === clientId ? '我' : (msg.senderIp ? msg.senderIp.slice(-4) : msg.senderId.slice(0, 4)) }}</span>
                  <span class="chat-time">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
                </div>
                <div
                  v-if="msg.revoked"
                  class="chat-message-revoked"
                >
                  {{ msg.senderId === clientId ? '你撤回了一条消息' : '对方撤回了一条消息' }}
                </div>
                <div
                  v-else
                  class="chat-message-content"
                  :class="{ 'chat-message-content-image': isImageLikeMessage(msg) }"
                >
                  <template v-if="msg.type === 'text'">
                    {{ msg.content }}
                  </template>
                  <template v-else-if="msg.type === 'image'">
                    <a :href="msg.content" target="_blank">
                      <img :src="msg.content" class="chat-image" />
                    </a>
                  </template>
                  <template v-else-if="msg.type === 'file'">
                    <a :href="msg.content" target="_blank" class="chat-file">
                      <span class="material-symbols-outlined">description</span>
                      {{ msg.fileName }} ({{ formatFileSize(msg.fileSize) }})
                    </a>
                  </template>
                  <template v-else-if="msg.type === 'image_group'">
                    <div class="chat-image-grid" :class="getImageGridClass(msg.images?.length || 0)">
                      <a
                        v-for="(image, index) in msg.images"
                        :key="`${msg.id}_${index}`"
                        :href="image.url"
                        target="_blank"
                        class="chat-image-grid-item"
                      >
                        <img :src="image.url" class="chat-image-grid-image" />
                      </a>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            <div v-if="pendingImages.length > 0" class="chat-pending-images">
              <div v-for="item in pendingImages" :key="item.id" class="chat-pending-image-item">
                <img :src="item.url" class="chat-pending-image" />
                <button class="chat-pending-remove" @click="removePendingImage(item.id)" type="button">×</button>
              </div>
            </div>
            <div class="chat-input-area">
              <md-icon-button @click="fileInput?.click()" aria-label="发送附件">
                <span class="material-symbols-outlined">attach_file</span>
              </md-icon-button>
              <md-icon-button @click="imageInput?.click()" aria-label="发送图片">
                <span class="material-symbols-outlined">image</span>
              </md-icon-button>
              <input type="file" ref="fileInput" style="display: none" @change="uploadFile($event, 'file')" />
              <input type="file" ref="imageInput" style="display: none" accept="image/*" multiple @change="selectImages($event)" />
              
              <md-outlined-text-field
                class="chat-input-field"
                placeholder="输入消息(上限1000字)..."
                :value="chatInput"
                @input="chatInput = $event.target.value"
                @keyup.enter="sendTextMessage"
                @paste="handlePaste"
                maxlength="1000"
              ></md-outlined-text-field>
              <md-icon-button @click="sendTextMessage" aria-label="发送" :disabled="!chatInput.trim() && pendingImages.length === 0">
                <span class="material-symbols-outlined">send</span>
              </md-icon-button>
            </div>
          </div>
        </div>

        <!-- 日志悬浮窗 -->
        <div v-show="showLogs" class="room-logs-popup">
          <div class="logs-header">
            <span>运行日志</span>
            <md-icon-button @click="toggleLogs" aria-label="关闭日志" class="close-logs-btn">
              <span class="material-symbols-outlined">close</span>
            </md-icon-button>
          </div>
          <div class="logs-container" ref="logsContainer">
            <div v-for="(log, index) in logs" :key="index" class="log-entry">
              {{ log }}
            </div>
          </div>
        </div>
        <div v-if="messageMenu.visible" class="chat-menu-mask" @click="closeMessageMenu">
          <div class="chat-message-menu" :style="{ left: `${messageMenu.x}px`, top: `${messageMenu.y}px` }" @click.stop>
            <button
              v-if="messageMenu.message && canRevokeMessage(messageMenu.message)"
              class="chat-menu-item"
              type="button"
              @click="revokeMessage(messageMenu.message)"
            >
              撤回
            </button>
            <button
              v-if="messageMenu.message && canCopyMessage(messageMenu.message)"
              class="chat-menu-item"
              type="button"
              @click="copyMessage(messageMenu.message)"
            >
              复制
            </button>
            <button class="chat-menu-item" type="button" @click="pasteFromClipboard">
              粘贴
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { getKey, hashPassword, encryptAudio, decryptAudio } from './utils/crypto'
import { createClientId, isSocketOpen, buildWebSocketUrl, float32ToInt16, int16ToFloat32 } from './utils/helpers'
import { AudioEngine, AudioRuntimeConfig } from './core/audio'
import { initPeerConnection, handleWebRTCSignal } from './core/connection'

// --- 状态定义 ---
const roomKey = ref('')
const isInRoom = ref(false)
const isConnecting = ref(false)
const logs = ref<string[]>([])
const logsContainer = ref<HTMLElement | null>(null)
const showLogs = ref(false)

const toggleLogs = () => {
  showLogs.value = !showLogs.value
  if (showLogs.value) {
    nextTick(() => {
      if (logsContainer.value) {
        logsContainer.value.scrollTop = logsContainer.value.scrollHeight
      }
    })
  }
}

type RoomUser = {
  id: string
  ip: string
  status: string
}

// 聊天相关状态
type ChatMessage = {
  id: string
  roomId: string
  senderId: string
  senderIp?: string
  type: string
  content: string
  fileName?: string
  fileSize?: number
  images?: ChatImage[]
  timestamp: number
  revoked?: boolean
  revokedAt?: number
}
type ChatImage = {
  url: string
  fileName?: string
  fileSize?: number
}
type PendingImage = {
  id: string
  file: File
  url: string
}
type MessageMenuState = {
  visible: boolean
  x: number
  y: number
  message: ChatMessage | null
}
const chatMessages = ref<ChatMessage[]>([])
const chatInput = ref('')
const chatMessagesContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const pendingImages = ref<PendingImage[]>([])
const messageMenu = ref<MessageMenuState>({
  visible: false,
  x: 0,
  y: 0,
  message: null
})
let messageLongPressTimer: number | null = null

const formatFileSize = (bytes?: number) => {
  if (bytes === undefined) return '0 B'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 房间状态
const currentRoomUsers = ref<RoomUser[]>([])
const userCount = computed(() => currentRoomUsers.value.length)

// 控制状态
const isCalling = ref(false)
const isMuted = ref(false)
const mediaChannelReady = ref(false)
const isRequestingTalk = ref(false)

// 按钮显示逻辑计算属性
const showCallBtn = computed(() => {
  const isSomeoneTalking = currentRoomUsers.value.some(u => u.status === '对讲中')
  if (audioConfig.mode === 'walkie-talkie' && isSomeoneTalking && !isCalling.value) {
    return false
  }
  return true
})

const showRequestTalkBtn = computed(() => {
  const isSomeoneTalking = currentRoomUsers.value.some(u => u.status === '对讲中')
  if (audioConfig.mode === 'walkie-talkie' && isSomeoneTalking && !isCalling.value) {
    return true
  }
  return false
})

const isCallBtnDisabled = computed(() => {
  if (userCount.value < 2) return true
  if (!mediaChannelReady.value) return true
  return false
})

const callBtnText = computed(() => {
  if (isCalling.value) return '关闭麦克风'
  if (userCount.value < 2) return '打开麦克风 (需至少2人在线)'
  if (!mediaChannelReady.value) return '打开麦克风 (媒体连接中...)'
  return '打开麦克风'
})

const isRequestTalkBtnDisabled = computed(() => isRequestingTalk.value)
const requestTalkBtnText = computed(() => isRequestingTalk.value ? '申请中...' : '申请麦克风')

// --- 核心变量 ---
let cryptoKey: CryptoKey | null = null
let controlWs: WebSocket | null = null
let mediaWs: WebSocket | null = null
let clientId = ''
let currentRoomId = ''
let isCleaningUp = false

// WebRTC
let peerConnections: Record<string, RTCPeerConnection> = {}

// 音频
let audioConfig: AudioRuntimeConfig = { mode: 'normal', quality: 'lossless', sampleRate: 48000, bufferSize: 4096, protocol: 'ws' }
let audioUnlockBound = false

// --- 辅助函数 ---
const logMsg = (msg: string) => {
  const time = new Date().toLocaleTimeString()
  logs.value.push(`[${time}] ${msg}`)
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    }
  })
}

const audioEngine = new AudioEngine(logMsg)

const getStatusColorClass = (status: string) => {
  if (status === '就绪') return 'ip-status-ok'
  if (status === '麦克风无权限') return 'ip-status-warn'
  if (status === '对讲中') return 'ip-status-talk'
  return ''
}

const bindAudioUnlockEvents = () => {
  if (audioUnlockBound) return
  const unlockAudio = async () => {
    await audioEngine.ensureAudioContextReady(audioConfig, () => {}, () => {})
    await audioEngine.ensurePlaybackWorkletReady(audioConfig, () => {}, () => {})
    await audioEngine.syncAllRemoteAudioPlayback()
  }
  document.addEventListener('click', unlockAudio, { passive: true })
  document.addEventListener('keydown', unlockAudio)
  document.addEventListener('touchstart', unlockAudio, { passive: true })
  audioUnlockBound = true
}

const getPeerConnection = (targetId: string) => {
  if (peerConnections[targetId]) return peerConnections[targetId]

  const pc = initPeerConnection(
    targetId,
    controlWs,
    audioEngine.mediaStream,
    audioConfig.quality,
    (id, stream) => {
      const remoteAudio = audioEngine.remoteAudioElements[id] || document.createElement('audio')
      remoteAudio.srcObject = stream
      remoteAudio.autoplay = true
      remoteAudio.setAttribute('playsinline', 'true')
      remoteAudio.id = `audio_${id}`
      audioEngine.remoteAudioElements[id] = remoteAudio
      if (!remoteAudio.isConnected) {
        document.body.appendChild(remoteAudio)
      }
      audioEngine.syncRemoteAudioElement(remoteAudio).catch(e => console.warn(e))
    },
    (id) => {
      const audioEl = audioEngine.remoteAudioElements[id]
      if (audioEl) {
        audioEl.remove()
        delete audioEngine.remoteAudioElements[id]
      }
      pc.close()
      delete peerConnections[id]
    }
  )

  peerConnections[targetId] = pc
  return pc
}

// --- 核心逻辑 ---
const joinRoom = async () => {
  if (!roomKey.value) {
    alert('请输入频道密码！')
    return
  }
  isConnecting.value = true
  try {
    cryptoKey = await getKey(roomKey.value)
    await audioEngine.ensureAudioContextReady(audioConfig, () => {}, () => {})
    logMsg('生成端到端加密密钥成功')
    sessionStorage.setItem('roomPassword', roomKey.value)
  } catch (e: any) {
    alert('生成加密密钥失败: ' + e.message)
    isConnecting.value = false
    return
  }

  const roomId = await hashPassword(roomKey.value)
  currentRoomId = roomId
  let storedClientId = localStorage.getItem('phonecall_clientId')
  if (!storedClientId) {
    storedClientId = createClientId()
    localStorage.setItem('phonecall_clientId', storedClientId)
  }
  clientId = storedClientId
  currentRoomUsers.value = []
  isCleaningUp = false
  mediaChannelReady.value = false
  
  isInRoom.value = true
  isConnecting.value = false
  logs.value = []
  chatMessages.value = []
  logMsg('正在连接服务器进入频道...')
  connectControlChannel(roomId)
  fetchChatHistory(roomId)
}

const fetchChatHistory = async (roomId: string) => {
  try {
    const res = await fetch(`/api/chat/history?room=${roomId}`)
    if (res.ok) {
      const data = await res.json()
      chatMessages.value = data || []
      scrollToBottom()
    }
  } catch (e) {
    console.error('Failed to fetch chat history', e)
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatMessagesContainer.value) {
      chatMessagesContainer.value.scrollTop = chatMessagesContainer.value.scrollHeight
    }
  })
}

const isImageLikeMessage = (message: ChatMessage) => message.type === 'image' || message.type === 'image_group'

const getImageGridClass = (count: number) => {
  if (count <= 1) return 'chat-image-grid-1'
  if (count === 2 || count === 4) return 'chat-image-grid-2'
  return 'chat-image-grid-3'
}

const replaceChatMessage = (message: ChatMessage) => {
  const index = chatMessages.value.findIndex(item => item.id === message.id)
  if (index === -1) {
    chatMessages.value.push(message)
    scrollToBottom()
    return
  }
  chatMessages.value[index] = {
    ...chatMessages.value[index],
    ...message
  }
}

const clearPendingImages = () => {
  pendingImages.value.forEach(item => URL.revokeObjectURL(item.url))
  pendingImages.value = []
}

const removePendingImage = (id: string) => {
  const index = pendingImages.value.findIndex(item => item.id === id)
  if (index === -1) return
  URL.revokeObjectURL(pendingImages.value[index].url)
  pendingImages.value.splice(index, 1)
}

const addPendingImages = (files: File[]) => {
  if (pendingImages.value.length >= 9) {
    alert('最多一次发送 9 张图片')
    return
  }
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 20 * 1024 * 1024) {
      alert('图片太大！单张图片限制20MB')
      return
    }
    if (pendingImages.value.length >= 9) return
    pendingImages.value.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      file,
      url: URL.createObjectURL(file)
    })
  })
  if (pendingImages.value.length >= 9 && files.length > 9) {
    alert('最多一次发送 9 张图片')
  }
}

const appendInputText = (text: string) => {
  if (!text) return
  chatInput.value = chatInput.value ? `${chatInput.value}${text}` : text
}

const sendTextMessage = async () => {
  const content = chatInput.value.trim()
  const hasPendingImages = pendingImages.value.length > 0
  if (!content && !hasPendingImages) return
  
  if (content.length > 1000) {
    alert('消息内容超过1000字限制！')
    return
  }

  if (content) {
    if (!isSocketOpen(controlWs)) return
    controlWs!.send(JSON.stringify({
      type: 'chat',
      content: content
    }))
    chatInput.value = ''
  }

  if (!hasPendingImages) return

  const images = [...pendingImages.value]
  if (images.length > 1) {
    const success = await uploadImageGroup(images.map(item => item.file))
    if (success) {
      clearPendingImages()
    }
    return
  }

  for (const item of images) {
    const success = await uploadFileObj(item.file, 'image')
    if (!success) return
    removePendingImage(item.id)
  }
}

const uploadImageGroup = async (files: File[]) => {
  if (files.length === 0) return false
  if (files.length === 1) {
    return uploadFileObj(files[0], 'image')
  }

  const formData = new FormData()
  formData.append('room', currentRoomId)
  formData.append('client', clientId)
  files.forEach(file => {
    formData.append('files', file)
  })

  try {
    logMsg(`正在上传 ${files.length} 张图片...`)
    const res = await fetch('/api/chat/upload-images', {
      method: 'POST',
      body: formData
    })

    if (!res.ok) {
      const err = await res.text()
      alert('上传失败: ' + err)
      return false
    }

    logMsg('多图上传成功')
    return true
  } catch (e) {
    console.error('Upload group error', e)
    alert('多图上传发生错误')
    return false
  }
}

const uploadFileObj = async (file: File, type: 'image' | 'file') => {
  const maxSize = type === 'image' ? 20 * 1024 * 1024 : 100 * 1024 * 1024
  if (file.size > maxSize) {
    alert(`文件太大！${type === 'image' ? '图片限制20MB' : '附件限制100MB'}`)
    return
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('room', currentRoomId)
  formData.append('client', clientId)
  formData.append('type', type)

  try {
    logMsg(`正在上传${type === 'image' ? '图片' : '附件'}...`)
    const res = await fetch('/api/chat/upload', {
      method: 'POST',
      body: formData
    })
    
    if (!res.ok) {
      const err = await res.text()
      alert('上传失败: ' + err)
      return false
    } else {
      logMsg('上传成功')
      return true
    }
  } catch (e) {
    console.error('Upload error', e)
    alert('上传发生错误')
    return false
  }
}

const uploadFile = async (event: Event, type: 'image' | 'file') => {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  if (type === 'image') {
    addPendingImages(files)
    target.value = ''
    return
  }
  const file = files[0]
  if (file) {
    await uploadFileObj(file, type)
  }
  target.value = ''
}

const selectImages = (event: Event) => {
  uploadFile(event, 'image')
}

const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return
  const imageFiles: File[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        imageFiles.push(file)
      }
    }
  }
  if (imageFiles.length > 0) {
    e.preventDefault()
    addPendingImages(imageFiles)
  }
}

const canRevokeMessage = (message: ChatMessage) => {
  if (message.senderId !== clientId || message.revoked) return false
  return Date.now() - message.timestamp <= 2 * 60 * 1000
}

const canCopyMessage = (message: ChatMessage) => !message.revoked

const closeMessageMenu = () => {
  messageMenu.value = {
    visible: false,
    x: 0,
    y: 0,
    message: null
  }
}

const openMessageMenuAt = (x: number, y: number, message: ChatMessage) => {
  const itemCount = [
    canRevokeMessage(message),
    canCopyMessage(message),
    true
  ].filter(Boolean).length
  const menuWidth = 160
  const menuHeight = itemCount * 44 + 12
  const padding = 12
  messageMenu.value = {
    visible: true,
    x: Math.min(x, window.innerWidth - menuWidth - padding),
    y: Math.min(y, window.innerHeight - menuHeight - padding),
    message
  }
}

const openMessageMenu = (event: MouseEvent, message: ChatMessage) => {
  openMessageMenuAt(event.clientX, event.clientY, message)
}

const cancelMessageLongPress = () => {
  if (messageLongPressTimer !== null) {
    window.clearTimeout(messageLongPressTimer)
    messageLongPressTimer = null
  }
}

const startMessageLongPress = (event: TouchEvent, message: ChatMessage) => {
  cancelMessageLongPress()
  const touch = event.touches[0]
  if (!touch) return
  messageLongPressTimer = window.setTimeout(() => {
    openMessageMenuAt(touch.clientX, touch.clientY, message)
    messageLongPressTimer = null
  }, 450)
}

const copyMessage = async (message: ChatMessage) => {
  closeMessageMenu()
  try {
    if (message.type === 'image' && 'clipboard' in navigator && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const response = await fetch(message.content)
      if (response.ok) {
        const blob = await response.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        logMsg('已复制图片')
        return
      }
    }

    if (message.type === 'image_group') {
      const textToCopy = (message.images || [])
        .map(image => new URL(image.url, window.location.origin).toString())
        .join('\n')
      await navigator.clipboard.writeText(textToCopy)
      logMsg('已复制图片链接')
      return
    }

    const textToCopy = message.type === 'text'
      ? message.content
      : new URL(message.content, window.location.origin).toString()
    await navigator.clipboard.writeText(textToCopy)
    logMsg(message.type === 'file' ? '已复制文件链接' : '已复制消息')
  } catch (e) {
    alert('复制失败，请检查浏览器权限设置')
  }
}

const pasteFromClipboard = async () => {
  closeMessageMenu()
  try {
    const imageFiles: File[] = []
    let text = ''

    if ('clipboard' in navigator && 'read' in navigator.clipboard) {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          imageFiles.push(new File([blob], `pasted-${Date.now()}.${imageType.split('/')[1] || 'png'}`, { type: imageType }))
          continue
        }
        if (item.types.includes('text/plain')) {
          const textBlob = await item.getType('text/plain')
          text += await textBlob.text()
        }
      }
    } else if ('clipboard' in navigator && 'readText' in navigator.clipboard) {
      text = await navigator.clipboard.readText()
    }

    if (imageFiles.length > 0) {
      addPendingImages(imageFiles)
    }
    if (text) {
      appendInputText(text)
    }
  } catch (e) {
    alert('粘贴失败，请检查浏览器权限设置')
  }
}

const revokeMessage = async (message: ChatMessage) => {
  closeMessageMenu()
  if (!canRevokeMessage(message)) {
    alert('该消息已超过撤回时限')
    return
  }
  try {
    const response = await fetch('/api/chat/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId: currentRoomId,
        clientId,
        messageId: message.id
      })
    })
    if (!response.ok) {
      alert(await response.text())
      return
    }
    const updatedMessage = await response.json()
    replaceChatMessage(updatedMessage)
  } catch (e) {
    alert('撤回失败，请稍后再试')
  }
}

const connectControlChannel = (roomId: string) => {
  controlWs = new WebSocket(buildWebSocketUrl('/ws/control', roomId, clientId))

  controlWs.onopen = () => {
    logMsg('控制通道已连接')
    audioEngine.ensureAudioContextReady(audioConfig, () => {}, () => {}).catch(e => console.warn(e))
    bindAudioUnlockEvents()
    AudioEngine.checkMicPermission().then(granted => {
      if (granted) {
        reportStatus('就绪')
      } else {
        logMsg('麦克风无权限')
        reportStatus('麦克风无权限')
      }
    })
    connectMediaChannel(roomId)
  }

  controlWs.onmessage = (event) => {
    if (typeof event.data !== 'string') return
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'room_info') {
        updateRoomInfo(data)
      } else if (data.type === 'error') {
        alert('服务器错误: ' + data.message)
        leaveRoom()
      } else if (data.type === 'request_talk') {
        if (isCalling.value) {
          if (confirm(`[${data.fromIP}] 正在申请讲话，是否同意让出麦克风？`)) {
            toggleCall(false) // 关闭麦克风
            if (isSocketOpen(controlWs)) {
              controlWs!.send(JSON.stringify({ type: 'approve_talk', toIP: data.fromIP }))
            }
          }
        }
      } else if (data.type === 'approve_talk') {
        isRequestingTalk.value = false
        logMsg('对方已让出麦克风，你可以开始讲话了！')
        toggleCall(true) // 开启麦克风
      } else if (['webrtc_offer', 'webrtc_answer', 'webrtc_candidate'].includes(data.type)) {
        handleWebRTCSignal(data, clientId, audioConfig.quality, controlWs, getPeerConnection)
      } else if (data.type === 'chat_message') {
        replaceChatMessage(data.data)
      } else if (data.type === 'chat_message_revoked') {
        replaceChatMessage(data.data)
      }
    } catch (e) {}
  }

  controlWs.onclose = () => {
    if (isCleaningUp) return
    logMsg('控制通道已断开')
    leaveRoom()
  }
}

const connectMediaChannel = (roomId: string) => {
  if (audioConfig.protocol === 'webrtc') {
    mediaChannelReady.value = true
    logMsg('使用 WebRTC 协议，媒体通道已就绪')
    return
  }

  mediaChannelReady.value = false
  mediaWs = new WebSocket(buildWebSocketUrl('/ws/media', roomId, clientId))
  mediaWs.binaryType = 'arraybuffer'

  mediaWs.onopen = () => {
    mediaChannelReady.value = true
    logMsg('媒体通道已连接，等待其他人加入...')
  }

  mediaWs.onmessage = async (event) => {
    if (typeof event.data === 'string') return
    if (!(event.data instanceof ArrayBuffer) || audioEngine.getMuted() || !cryptoKey) return
    const isAudioReady = await audioEngine.ensureAudioContextReady(audioConfig, () => {}, () => {})
    if (!isAudioReady || !audioEngine.context) return

    try {
      let pcmData: Float32Array
      if (audioConfig.quality === 'lossless') {
        const decryptedBuffer = await decryptAudio(event.data, cryptoKey)
        pcmData = new Float32Array(decryptedBuffer)
      } else {
        const int16Data = await decryptAudio(event.data, cryptoKey)
        pcmData = int16ToFloat32(new Int16Array(int16Data))
      }
      await audioEngine.enqueueAudioData(pcmData, audioConfig, () => {}, () => {})
    } catch (e) {
      console.warn('Audio Decryption Failed', e)
    }
  }

  mediaWs.onclose = () => {
    if (isCleaningUp) return
    mediaChannelReady.value = false
    logMsg('媒体通道已断开')
    leaveRoom()
  }
}

const updateRoomInfo = (data: any) => {
  currentRoomUsers.value = Array.isArray(data.users) ? data.users : []

  if (audioConfig.protocol === 'webrtc') {
    currentRoomUsers.value.forEach(u => {
      if (u.id !== clientId) getPeerConnection(u.id)
    })

    const activeIds = currentRoomUsers.value.map(u => u.id)
    Object.keys(peerConnections).forEach(peerId => {
      if (!activeIds.includes(peerId)) {
        peerConnections[peerId].close()
        delete peerConnections[peerId]
        const audioEl = audioEngine.remoteAudioElements[peerId]
        if (audioEl) {
          audioEl.remove()
          delete audioEngine.remoteAudioElements[peerId]
        }
      }
    })
  }

  if (data.count >= 2 && mediaChannelReady.value && !isCalling.value) {
    const isSomeoneTalking = currentRoomUsers.value.some(u => u.status === '对讲中')
    if (!isSomeoneTalking) {
      logMsg('频道内有 2 人，现在可以打开麦克风了！')
    }
  }
}

const toggleCall = async (forceState?: boolean | Event) => {
  const isEvent = forceState instanceof Event
  const targetState = (!isEvent && forceState !== undefined) ? forceState as boolean : !isCalling.value

  if (!targetState) {
    stopAudio()
    reportStatus('就绪')
    return
  }

  const isSomeoneTalking = currentRoomUsers.value.some(u => u.status === '对讲中')
  if (audioConfig.mode === 'walkie-talkie' && isSomeoneTalking) {
    alert('当前频道已有其他人在讲话，请稍后再试或点击申请麦克风！')
    return
  }

  if (audioConfig.protocol !== 'webrtc' && !isSocketOpen(mediaWs)) {
    alert('媒体通道尚未建立，请稍后再试。')
    return
  }

  try {
    await startAudio()
    isCalling.value = true
    logMsg('已打开麦克风')
    reportStatus('对讲中')
  } catch (e: any) {
    logMsg('开启麦克风失败: ' + e.message)
    reportStatus('麦克风无权限')
  }
}

const startAudio = async () => {
  await audioEngine.startCapture(
    audioConfig,
    () => {},
    () => {},
    async (samples) => {
      if (!isSocketOpen(mediaWs) || !cryptoKey) return
      try {
        let encryptedBuffer
        if (audioConfig.quality === 'lossless') {
          const float32Data = samples.slice()
          encryptedBuffer = await encryptAudio(float32Data, cryptoKey)
        } else {
          const int16Data = float32ToInt16(samples)
          encryptedBuffer = await encryptAudio(int16Data, cryptoKey)
        }
        mediaWs!.send(encryptedBuffer)
      } catch (err) {
        console.error('Audio encryption failed', err)
      }
    }
  )

  if (audioConfig.protocol === 'webrtc') {
    Object.values(peerConnections).forEach(pc => {
      if (pc.signalingState === 'closed') return
      
      const senders = pc.getSenders()
      audioEngine.mediaStream!.getTracks().forEach(track => {
        const sender = senders.find(s => s.track && s.track.kind === track.kind)
        if (sender) {
          sender.replaceTrack(track).catch(e => console.warn('Replace track failed:', e))
        } else {
          pc.addTrack(track, audioEngine.mediaStream!)
        }
      })
      // 移除手动触发 negotiationneeded，让浏览器自己处理 addTrack 带来的原生事件
    })
  }
}

const stopAudio = () => {
  isCalling.value = false

  if (audioConfig.protocol === 'webrtc') {
    Object.values(peerConnections).forEach(pc => {
      if (pc.signalingState === 'closed') return
      
      const senders = pc.getSenders()
      senders.forEach(sender => {
        if (sender.track) {
          sender.track.enabled = false
        }
      })
    })
  }

  audioEngine.stopCapture()
  logMsg('已关闭麦克风')
}

const reportStatus = (status: string) => {
  if (isSocketOpen(controlWs)) {
    controlWs!.send(JSON.stringify({ type: 'update_status', status: status }))
  }
}

const toggleMute = () => {
  isMuted.value = !isMuted.value
  audioEngine.setMuted(isMuted.value)
  logMsg(isMuted.value ? '已静音' : '已开启扬声器')

  if (!isMuted.value) {
    audioEngine.ensureAudioContextReady(audioConfig, () => {}, () => {}).catch(e => console.warn(e))
    audioEngine.ensurePlaybackWorkletReady(audioConfig, () => {}, () => {}).catch(e => console.warn(e))
    audioEngine.syncAllRemoteAudioPlayback().catch(e => console.warn(e))
  }
}

const requestTalk = () => {
  if (isSocketOpen(controlWs)) {
    logMsg('已发送申请讲话请求，等待对方同意...')
    controlWs!.send(JSON.stringify({ type: 'request_talk' }))
    isRequestingTalk.value = true
    
    setTimeout(() => {
      if (isRequestingTalk.value) {
        isRequestingTalk.value = false
        logMsg('申请讲话超时未响应')
      }
    }, 5000)
  }
}

const leaveRoom = () => {
  if (isCleaningUp) return
  isCleaningUp = true
  stopAudio()
  sessionStorage.removeItem('roomPassword')

  audioEngine.cleanup()
  
  Object.values(peerConnections).forEach(pc => pc.close())
  peerConnections = {}

  if (controlWs) {
    controlWs.onclose = null
    controlWs.close()
    controlWs = null
  }
  if (mediaWs) {
    mediaWs.onclose = null
    mediaWs.close()
    mediaWs = null
  }
  
  isInRoom.value = false
  currentRoomUsers.value = []
  mediaChannelReady.value = false
  isRequestingTalk.value = false
  clearPendingImages()
  closeMessageMenu()
  logMsg('已退出频道')
  isCleaningUp = false
}

onMounted(async () => {
  bindAudioUnlockEvents()
  try {
    const response = await fetch('/api/audio-config')
    if (response.ok) {
      const config = await response.json()
      audioConfig = { ...audioConfig, ...config }
      console.log('Loaded audio config:', audioConfig)
    }
  } catch (e) {
    console.warn('Failed to load audio config, using defaults.')
  }

  const savedPassword = sessionStorage.getItem('roomPassword')
  if (savedPassword) {
    roomKey.value = savedPassword
    logMsg('检测到上次登录的频道密码，自动连接中...')
    joinRoom()
  }
})

onBeforeUnmount(() => {
  cancelMessageLongPress()
  clearPendingImages()
})
</script>

<style scoped>
.font-monospace {
  font-family: monospace;
}

.chat-container {
  background: var(--md-sys-color-surface-container-highest);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.chat-messages {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  max-width: 80%;
  align-self: flex-start;
}

.chat-message-self {
  align-self: flex-end;
}

.chat-message-header {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 4px;
  display: flex;
  gap: 8px;
}

.chat-message-self .chat-message-header {
  flex-direction: row-reverse;
}

.chat-message-content {
  background: var(--md-sys-color-surface);
  padding: 8px 12px;
  border-radius: 12px;
  border-top-left-radius: 4px;
  color: var(--md-sys-color-on-surface);
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-message-content-image {
  padding: 0;
  background: transparent;
}

.chat-message-self .chat-message-content {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  border-top-left-radius: 12px;
  border-top-right-radius: 4px;
}

.chat-message-self .chat-message-content-image {
  background: transparent;
}

.chat-message-image-only {
  max-width: min(280px, 70%);
}

.chat-message-revoked {
  color: var(--md-sys-color-on-surface-variant);
  font-size: 13px;
  font-style: italic;
  padding: 6px 0;
}

.chat-image {
  max-width: 100%;
  max-height: 260px;
  border-radius: 8px;
  display: block;
}

.chat-image-grid {
  display: grid;
  gap: 4px;
  width: min(280px, 70vw);
}

.chat-image-grid-1 {
  grid-template-columns: 1fr;
}

.chat-image-grid-2 {
  grid-template-columns: repeat(2, 1fr);
}

.chat-image-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.chat-image-grid-item {
  display: block;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 8px;
  background: var(--md-sys-color-surface-container);
}

.chat-image-grid-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.chat-file {
  display: flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  color: inherit;
  font-weight: 500;
}

.chat-input-area {
  display: flex;
  align-items: center;
  padding: 8px;
  background: var(--md-sys-color-surface-container);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  gap: 4px;
}

.chat-pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 12px 0;
  background: var(--md-sys-color-surface-container);
}

.chat-pending-image-item {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--md-sys-color-surface);
}

.chat-pending-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.chat-pending-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  cursor: pointer;
  line-height: 1;
}

.chat-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
}

.chat-message-menu {
  position: fixed;
  width: 160px;
  padding: 6px 0;
  border-radius: 14px;
  background: var(--md-sys-color-surface);
  box-shadow: var(--md-elevation-2);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.chat-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  text-align: left;
  padding: 12px 16px;
  font-size: 14px;
  cursor: pointer;
}

.chat-menu-item:hover {
  background: var(--md-sys-color-surface-container);
}

.chat-input-field {
  flex: 1;
}
</style>
