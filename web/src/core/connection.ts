import { isSocketOpen } from '../utils/helpers'

export const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export const setHighBitrateSDP = (sdp: string, quality: string): string => {
  if (quality !== 'lossless') return sdp
  return sdp.replace(/a=fmtp:111(.*)/g, 'a=fmtp:111$1;stereo=1;sprop-stereo=1;maxaveragebitrate=510000;useinbandfec=1;cbr=1;minptime=10')
}

export const initPeerConnection = (
  targetId: string,
  controlWs: WebSocket | null,
  mediaStream: MediaStream | null,
  quality: string,
  onTrack: (targetId: string, stream: MediaStream) => void,
  onClose: (targetId: string) => void
): RTCPeerConnection => {
  const pc = new RTCPeerConnection(rtcConfig)

  pc.onicecandidate = event => {
    if (event.candidate && isSocketOpen(controlWs)) {
      controlWs!.send(JSON.stringify({ type: 'webrtc_candidate', targetID: targetId, candidate: event.candidate }))
    }
  }

  pc.onnegotiationneeded = async () => {
    try {
      if (pc.signalingState !== 'stable') return
      const offer = await pc.createOffer()
      offer.sdp = setHighBitrateSDP(offer.sdp || '', quality)
      await pc.setLocalDescription(offer)
      if (isSocketOpen(controlWs)) {
        controlWs!.send(JSON.stringify({ type: 'webrtc_offer', targetID: targetId, sdp: pc.localDescription || offer }))
      }
    } catch (e) {
      console.error('Negotiation error:', e)
    }
  }

  pc.ontrack = event => {
    onTrack(targetId, event.streams[0])
  }

  pc.oniceconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
      onClose(targetId)
    }
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream!))
  }

  return pc
}

export const handleWebRTCSignal = async (
  data: any,
  clientId: string,
  quality: string,
  controlWs: WebSocket | null,
  getPeerConnection: (targetId: string) => RTCPeerConnection
) => {
  const fromId = data.fromID
  if (!fromId) return

  if (data.type === 'webrtc_offer') {
    const pc = getPeerConnection(fromId)
    try {
      if (pc.signalingState !== 'stable') {
        if (clientId < fromId) {
          console.warn('Glare detected, ignoring incoming offer from', fromId)
          return
        } else {
          console.warn('Glare detected, rolling back local offer')
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' })
          ]).catch(e => console.warn('Rollback failed:', e))
        }
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      const answer = await pc.createAnswer()
      answer.sdp = setHighBitrateSDP(answer.sdp || '', quality)
      await pc.setLocalDescription(answer)
      
      if (isSocketOpen(controlWs)) {
        controlWs!.send(JSON.stringify({ type: 'webrtc_answer', targetID: fromId, sdp: pc.localDescription || answer }))
      }
    } catch (e) {
      console.error('Handle offer error:', e)
    }
  } else if (data.type === 'webrtc_answer') {
    const pc = getPeerConnection(fromId)
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      }
    } catch (e) {
      console.error('Handle answer error:', e)
    }
  } else if (data.type === 'webrtc_candidate') {
    const pc = getPeerConnection(fromId)
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (e) {
      console.error('Handle candidate error:', e)
    }
  }
}
