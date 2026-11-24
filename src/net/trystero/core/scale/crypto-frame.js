import {ecdsaSign, signRoomAuth} from '../crypto.js'
import {maxActionFrameBytes, maxOverlayHeaderBytes} from '../data-limits.js'
import {
  jwkToCompactPub,
  signUserEndpointProof,
  verifyWithP256
} from '../identity.js'
                                                 
import {fromBase64Url, toBase64Url} from '../primitives.js'
import {canonTag} from '../signed-record.js'
                                                           
import {
  base64UrlRe,
  decodeBytes,
  encodeBytes,
  encodeBytesInto,
  fromJson,
  isObj,
  mkErr,
  toJson,
  utf8ByteLength
} from '../utils.js'

export const overlayFrameVersion = 4
export const overlayControlKind = 1
export const overlayBroadcastKind = 2
export const overlayUnicastKind = 3
export const maxDescriptorNeighbors = 64

                              
                
             
                 
                     
                     
                    
                 
                     
                    
                        
                   
              
 

                                   
     
                 
                                   
     
     
                
                    
                 
                  
     

                                       
           
           
           
           
            
 

                              
                
                           
                    
                          
                   
 

export const isPeerUsable = (
  peer                        
)                     =>
  Boolean(peer && !peer.isDead && peer.channel?.readyState !== 'closed')

export const getPeerBufferedBytes = (peer                        )         =>
  typeof peer?.channel?.bufferedAmount === 'number'
    ? peer.channel.bufferedAmount
    : 0

export const packOverlayBinary = (
  kind        ,
  ttl        ,
  header                         ,
  payload            
)             => {
  const headerJson = toJson(header)
  const headerByteLen = utf8ByteLength(headerJson)
  const frame = new Uint8Array(5 + headerByteLen + payload.byteLength)
  frame[0] = overlayFrameVersion
  frame[1] = kind
  frame[2] = ttl & 0xff
  frame[3] = (headerByteLen >>> 8) & 0xff
  frame[4] = headerByteLen & 0xff
  encodeBytesInto(headerJson, frame.subarray(5, 5 + headerByteLen))
  frame.set(payload, 5 + headerByteLen)
  return frame
}

                                             
               
              
                                  
                     
 

export const unpackOverlayFrame = (
  bytes            
)                              => {
  if (bytes.byteLength < 5 || bytes[0] !== overlayFrameVersion) {
    return null
  }
  const headerLen = (bytes[3]  << 8) | bytes[4] 
  if (
    headerLen <= 0 ||
    headerLen > maxOverlayHeaderBytes ||
    5 + headerLen > bytes.byteLength
  ) {
    return null
  }
  try {
    const header = fromJson         (
      decodeBytes(bytes.subarray(5, 5 + headerLen))
    )
    return isObj(header)
      ? [bytes[1] , bytes[2] , header, bytes.subarray(5 + headerLen)]
      : null
  } catch {
    return null
  }
}

export const packOverlayControl = (msg                       )             => {
  const body = encodeBytes(toJson(msg))
  const frame = new Uint8Array(2 + body.byteLength)
  frame[0] = overlayFrameVersion
  frame[1] = overlayControlKind
  frame.set(body, 2)
  return frame
}

const gossipEnvelopeOverheadBytes = 32
const descByteLengthCache = /*@__PURE__*/ new WeakMap                        ()

export const packGossipControlFrames = (
  descriptors                  ,
  maxFrameBytes         = maxActionFrameBytes
)               => {
  if (!descriptors.length) {
    return []
  }

  const frames               = []
  let currentDescs                   = []
  let currentBytes = gossipEnvelopeOverheadBytes

  for (const desc of descriptors) {
    let descBytes = descByteLengthCache.get(desc)
    if (descBytes === undefined) {
      descBytes = encodeBytes(toJson(desc)).byteLength
      descByteLengthCache.set(desc, descBytes)
    }
    const addedBytes = (currentDescs.length > 0 ? 1 : 0) + descBytes
    if (currentDescs.length > 0 && currentBytes + addedBytes > maxFrameBytes) {
      frames.push(packOverlayControl({t: 'gossip', descriptors: currentDescs}))
      currentDescs = [desc]
      currentBytes = gossipEnvelopeOverheadBytes + descBytes
    } else {
      currentDescs.push(desc)
      currentBytes += addedBytes
    }
  }

  if (currentDescs.length > 0) {
    frames.push(packOverlayControl({t: 'gossip', descriptors: currentDescs}))
  }

  return frames
}

export const isValidOverlayMsgId = (msgId        )          => {
  if (!msgId.length || msgId.length > 128) {
    return false
  }
  for (let i = 0; i < msgId.length; i++) {
    const code = msgId.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return false
    }
  }
  return true
}

export const canonicalBroadcastHeader = (
  origin        ,
  msgId        ,
  seq        ,
  ts        ,
  appId        ,
  roomId        
)         => canonTag('broadcast-v4', [appId, roomId, origin, seq, ts, msgId])

export const canonicalUnicastHeader = (
  origin        ,
  dest        ,
  msgId        ,
  ivB64        ,
  seq        ,
  ts        ,
  appId        ,
  roomId        
)         =>
  canonTag('unicast-v4', [appId, roomId, origin, dest, seq, ts, msgId, ivB64])

export const canonicalLeaveHeader = (
  leavingId        ,
  seq        ,
  appId        ,
  roomId        
)         => canonTag('leave-v4', [appId, roomId, leavingId, seq])

export const buildOverlaySignedBytes = (
  canonicalHeader        ,
  payload            
)             => {
  const headerByteLen = utf8ByteLength(canonicalHeader)
  const combined = new Uint8Array(4 + headerByteLen + payload.byteLength)
  new DataView(combined.buffer).setUint32(0, headerByteLen)
  encodeBytesInto(canonicalHeader, combined.subarray(4, 4 + headerByteLen))
  combined.set(payload, 4 + headerByteLen)
  return combined
}

export const descriptorCanonicalPayload = (
  d                ,
  appId        ,
  roomId        
)         =>
  canonTag('desc-v4', [
    appId,
    roomId,
    d.peerId,
    d.seq,
    d.pktSeq ?? 0,
    d.neighbors,
    d.signPubKey ?? null,
    d.encPubKey ?? null,
    d.roomAuth ?? null,
    d.cert?.sig ?? null,
    ...(d.userId ? [d.userId, d.userPubKey ?? null, d.userProof ?? null] : [])
  ])

export const verifyBase64Sig = (
  sig        ,
  signedBytes            ,
  pubKey                     
)                             => {
  if (!sig || !base64UrlRe.test(sig)) {
    return false
  }
  try {
    return verifyWithP256(fromBase64Url(sig), signedBytes, pubKey)
  } catch {
    return false
  }
}

export const signOverlayPayload = async (
  signPrivateKey           ,
  canonicalHeader        ,
  payload            
)                  => {
  const combined = buildOverlaySignedBytes(canonicalHeader, payload)
  return toBase64Url(await ecdsaSign(signPrivateKey, combined                ))
}

export const signPeerDescriptor = async (
  descriptor                ,
  id                ,
  appId        ,
  roomId        ,
  password        ,
  userIdentity                     
)                          => {
  if (password) {
    descriptor.roomAuth = await signRoomAuth(
      password,
      appId,
      roomId,
      descriptor.peerId,
      descriptor.seq
    )
  }
  if (userIdentity) {
    descriptor.userId = userIdentity.userId
    descriptor.userPubKey = jwkToCompactPub(userIdentity.signPubJwk)
    descriptor.userProof = await signUserEndpointProof(userIdentity, {
      appId,
      roomId,
      peerId: descriptor.peerId,
      peerPubJwk: id.signPubKey,
      seq: descriptor.seq
    })
  }
  const canonicalBytes = encodeBytes(
    descriptorCanonicalPayload(descriptor, appId, roomId)
  )
  descriptor.sig = toBase64Url(
    await ecdsaSign(id.signPrivateKey, canonicalBytes                )
  )
  return descriptor
}

const aesGcmParams = (
  iv            ,
  canonicalHeader        
)               => ({
  name: 'AES-GCM',
  iv: iv                ,
  additionalData: encodeBytes(canonicalHeader)                
})

export const encryptUnicastPayload = async (
  aesKey           ,
  iv            ,
  canonicalHeader        ,
  plainPayload            
)                      =>
  new Uint8Array(
    await crypto.subtle.encrypt(
      aesGcmParams(iv, canonicalHeader),
      aesKey,
      plainPayload                
    )
  )

export const decryptUnicastPayload = async (
  aesKey           ,
  ivB64        ,
  canonicalHeader        ,
  ciphertext            
)                      => {
  if (ivB64.length !== 16 || !base64UrlRe.test(ivB64)) {
    throw mkErr('invalid unicast iv')
  }
  const iv = fromBase64Url(ivB64)
  if (iv.byteLength !== 12) {
    throw mkErr('invalid unicast iv')
  }
  return new Uint8Array(
    await crypto.subtle.decrypt(
      aesGcmParams(iv, canonicalHeader),
      aesKey,
      ciphertext                
    )
  )
}
