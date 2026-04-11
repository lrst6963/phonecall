<template>
  <div class="app-wrapper">
    <!-- 加入频道视图 -->
    <div v-if="!isInRoom" class="card-container" style="max-width: 400px;">
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
    <div v-else class="card-container">
      <div class="header-flex">
        <h1>Web 通话</h1>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="badge">{{ userCount }} 人在线</span>
          <md-icon-button @click="leaveRoom" aria-label="退出频道">
            <span class="material-symbols-outlined">logout</span>
          </md-icon-button>
        </div>
      </div>
      
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

      <!-- 日志区域 -->
      <div class="logs-container" ref="logsContainer">
        <div v-for="(log, index) in logs" :key="index" class="log-entry">
          {{ log }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
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

type RoomUser = {
  id: string
  ip: string
  status: string
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
  clientId = createClientId()
  currentRoomUsers.value = []
  isCleaningUp = false
  mediaChannelReady.value = false
  
  isInRoom.value = true
  isConnecting.value = false
  logs.value = []
  logMsg('正在连接服务器进入频道...')
  connectControlChannel(roomId)
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
      if (pc.signalingState === 'stable') {
        const event = new Event('negotiationneeded')
        pc.dispatchEvent(event)
      }
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
</script>

<style scoped>
.font-monospace {
  font-family: monospace;
}
</style>
