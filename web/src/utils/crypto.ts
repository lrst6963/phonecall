export const getKey = async (password: string): Promise<CryptoKey> => {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('somesalt123'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  )
}

export const hashPassword = async (password: string): Promise<string> => {
  const enc = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(password))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export const encryptAudio = async (bufferSource: BufferSource | ArrayBufferLike | ArrayBufferView, key: CryptoKey): Promise<Uint8Array> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  // 兼容不同浏览器环境：如果环境不支持 SharedArrayBuffer，则安全跳过检查
  const isSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && bufferSource instanceof SharedArrayBuffer
  const isArrayBuffer = bufferSource instanceof ArrayBuffer
  
  const data = (isArrayBuffer || isSharedArrayBuffer) ? bufferSource : (bufferSource as ArrayBufferView).buffer
  const validData = (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) 
    ? new Uint8Array(data as SharedArrayBuffer).slice().buffer 
    : data

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, validData as BufferSource)
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)
  return combined
}

export const decryptAudio = async (encryptedData: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> => {
  const combined = new Uint8Array(encryptedData)
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted)
}
