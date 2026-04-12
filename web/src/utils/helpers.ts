export const createClientId = (): string => {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const isSocketOpen = (socket: WebSocket | null): boolean => {
  return socket !== null && socket.readyState === WebSocket.OPEN
}

export const buildWebSocketUrl = (
  path: string,
  roomId: string,
  clientId: string,
  extraParams: Record<string, string> = {}
): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ room: roomId, client: clientId, ...extraParams })
  return `${protocol}//${window.location.host}${path}?${params.toString()}`
}

export const float32ToInt16 = (float32Array: Float32Array): Int16Array => {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return int16Array
}

export const int16ToFloat32 = (int16Array: Int16Array): Float32Array => {
  const float32Array = new Float32Array(int16Array.length)
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF)
  }
  return float32Array
}
