import {
  base64UrlRe,
  bytesToBigInt,
  createBoundedCache,
  decodeBytes,
  domainTag,
  encodeBytes,
  fromBase64Url,
  mkErr,
  toBase64Url,
  toJson
} from './primitives.js'

export const ecdsaKeyAlgo                    = {
  name: 'ECDSA',
  namedCurve: 'P-256'
}

const ecdhKeyAlgo                    = {
  name: 'ECDH',
  namedCurve: 'P-256'
}

const ecdsaSignAlgo              = {
  name: 'ECDSA',
  hash: 'SHA-256'
}

                        
                   
                    
 

const algo = 'AES-GCM'
const gcmIvBytes = 12
const gcmTagBytes = 16
const hmacAlgo = 'HMAC'
const pbkdf2Iterations = 600_000
const emptyHkdfSalt = /*@__PURE__*/ new Uint8Array(32)
const roomAesInfo = /*@__PURE__*/ encodeBytes(domainTag('room-aes', 3))
const roomHmacInfo = /*@__PURE__*/ encodeBytes(domainTag('room-hmac', 3))
const topicHashCache = /*@__PURE__*/ createBoundedCache                (4_096)
const derivedRoomKeysCache = /*@__PURE__*/ createBoundedCache 
         
                          
 (64)

const p256N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
const p256HalfN = p256N >> 1n
const p256NBytes = /*@__PURE__*/ new Uint8Array([
  0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xbc, 0xe6, 0xfa, 0xad, 0xa7, 0x17, 0x9e, 0x84, 0xf3, 0xb9,
  0xca, 0xc2, 0xfc, 0x63, 0x25, 0x51
])

export const isValidP256PrivateScalar = (bytes            )          => {
  if (bytes.byteLength !== 32) {
    return false
  }
  let nonZero = 0
  let borrow = 0
  for (let i = 31; i >= 0; i--) {
    const b = bytes[i] 
    nonZero |= b
    borrow = ((b - p256NBytes[i]  - borrow) >> 8) & 1
  }
  return nonZero !== 0 && borrow === 1
}

export const normalizeLowSP256Signature = (sig            )             => {
  if (sig.byteLength !== 64) {
    return sig
  }
  const s = bytesToBigInt(sig.subarray(32, 64))
  if (s <= p256HalfN) {
    return sig
  }
  const out = sig.slice()
  let lowS = p256N - s
  for (let i = 63; i >= 32; i--) {
    out[i] = Number(lowS & 0xffn)
    lowS >>= 8n
  }
  return out
}

export const isLowSP256Signature = (sig            )          => {
  if (sig.byteLength !== 64) {
    return false
  }
  const r = bytesToBigInt(sig.subarray(0, 32))
  const s = bytesToBigInt(sig.subarray(32, 64))
  return r > 0n && r < p256N && s > 0n && s <= p256HalfN
}

export const sha256 = async (
  input                       
)                      =>
  new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      typeof input === 'string' ? (encodeBytes(input)                ) : input
    )
  )

export const ecdsaSign = async (
  privateKey           ,
  data              
)                      =>
  normalizeLowSP256Signature(
    new Uint8Array(await crypto.subtle.sign(ecdsaSignAlgo, privateKey, data))
  )

export const ecdsaVerify = (
  publicKey           ,
  sig              ,
  data              
)                   => crypto.subtle.verify(ecdsaSignAlgo, publicKey, sig, data)

export const hashTopic = async (str        )                  => {
  const cached = topicHashCache.get(str)
  if (cached !== undefined) {
    return cached
  }
  const digest = toBase64Url(await sha256(str))
  topicHashCache.set(str, digest)
  return digest
}

const derivePasswordRoomKeys = (
  secret        ,
  appId        ,
  roomId        
)                           => {
  const cacheKey = toJson([secret, appId, roomId])
  const existing = derivedRoomKeysCache.get(cacheKey)
  if (existing) {
    return existing
  }

  const deriveP = (async ()                           => {
    const [baseKey, salt] = await Promise.all([
      crypto.subtle.importKey(
        'raw',
        encodeBytes(secret)                ,
        'PBKDF2',
        false,
        ['deriveBits']
      ),
      sha256(toJson([domainTag('pbkdf2-master', 3), appId, roomId]))
    ])
    const masterBits = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt                ,
          iterations: pbkdf2Iterations,
          hash: 'SHA-256'
        },
        baseKey,
        256
      )
    )
    try {
      const hkdfKey = await crypto.subtle.importKey(
        'raw',
        masterBits                ,
        'HKDF',
        false,
        ['deriveKey']
      )
      const [aesKey, hmacKey] = await Promise.all([
        crypto.subtle.deriveKey(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: emptyHkdfSalt                ,
            info: roomAesInfo                
          },
          hkdfKey,
          {name: algo, length: 256},
          false,
          ['encrypt', 'decrypt']
        ),
        crypto.subtle.deriveKey(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: emptyHkdfSalt                ,
            info: roomHmacInfo                
          },
          hkdfKey,
          {name: hmacAlgo, hash: 'SHA-256', length: 256},
          false,
          ['sign', 'verify']
        )
      ])
      return {aesKey, hmacKey}
    } finally {
      masterBits.fill(0)
    }
  })()

  deriveP.catch(() => {
    derivedRoomKeysCache.delete(cacheKey)
  })
  derivedRoomKeysCache.set(cacheKey, deriveP)
  return deriveP
}

export const genKey = async (
  secret        ,
  appId        ,
  roomId        
)                     => {
  if (!secret) {
    const aesRaw = await sha256(
      toJson([domainTag('room-aes', 3), appId, roomId])
    )
    return crypto.subtle.importKey(
      'raw',
      aesRaw                ,
      {name: algo},
      false,
      ['encrypt', 'decrypt']
    )
  }
  return (await derivePasswordRoomKeys(secret, appId, roomId)).aesKey
}

const roomAuthPayload = (
  appId        ,
  roomId        ,
  peerId        ,
  seq        
)             =>
  encodeBytes(toJson([domainTag('ov-auth', 3), appId, roomId, peerId, seq]))

export const signRoomAuth = async (
  secret        ,
  appId        ,
  roomId        ,
  peerId        ,
  seq        
)                  => {
  if (!secret) {
    throw mkErr('room password is required')
  }
  const {hmacKey} = await derivePasswordRoomKeys(secret, appId, roomId)
  const mac = await crypto.subtle.sign(
    hmacAlgo,
    hmacKey,
    roomAuthPayload(appId, roomId, peerId, seq)                
  )
  return toBase64Url(new Uint8Array(mac))
}

export const verifyRoomAuth = async (
  secret        ,
  appId        ,
  roomId        ,
  peerId        ,
  seq        ,
  token        
)                   => {
  if (!secret || typeof token !== 'string' || !base64UrlRe.test(token)) {
    return false
  }
  try {
    const sigBytes = fromBase64Url(token)
    if (sigBytes.byteLength !== 32 || toBase64Url(sigBytes) !== token) {
      return false
    }
    const {hmacKey} = await derivePasswordRoomKeys(secret, appId, roomId)
    return await crypto.subtle.verify(
      hmacAlgo,
      hmacKey,
      sigBytes                ,
      roomAuthPayload(appId, roomId, peerId, seq)                
    )
  } catch {
    return false
  }
}

export const derivePairwiseAesKey = async (
  privateKey           ,
  remoteUncompressedPub            ,
  appId        ,
  roomId        ,
  peerA        ,
  peerB        
)                     => {
  const remotePub = await crypto.subtle.importKey(
    'raw',
    remoteUncompressedPub                ,
    ecdhKeyAlgo,
    false,
    []
  )
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {name: 'ECDH', public: remotePub},
      privateKey,
      256
    )
  )
  try {
    const [hkdfKey, salt] = await Promise.all([
      crypto.subtle.importKey(
        'raw',
        sharedBits                ,
        'HKDF',
        false,
        ['deriveKey']
      ),
      sha256(toJson([domainTag('e2e-salt', 2), appId, roomId]))
    ])
    const [firstPeer, secondPeer] =
      peerA < peerB ? [peerA, peerB] : [peerB, peerA]
    const info = encodeBytes(
      toJson([domainTag('e2e-info', 2), appId, roomId, firstPeer, secondPeer])
    )
    return await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt                ,
        info: info                
      },
      hkdfKey,
      {name: algo, length: 256},
      false,
      ['encrypt', 'decrypt']
    )
  } finally {
    sharedBits.fill(0)
  }
}

const gcmParams = (iv            , aad         )               =>
  aad === undefined
    ? {name: algo, iv: iv                }
    : {
        name: algo,
        iv: iv                ,
        additionalData: encodeBytes(aad)                
      }

export const encrypt = async (
  keyP                    ,
  plaintext        ,
  aad         
)                  => {
  const iv = crypto.getRandomValues(new Uint8Array(gcmIvBytes))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      gcmParams(iv, aad),
      await keyP,
      encodeBytes(plaintext)                
    )
  )
  const packed = new Uint8Array(gcmIvBytes + ct.byteLength)
  packed.set(iv, 0)
  packed.set(ct, gcmIvBytes)
  return toBase64Url(packed)
}

export const decrypt = async (
  keyP                    ,
  raw        ,
  aad         
)                  => {
  if (typeof raw !== 'string' || !base64UrlRe.test(raw)) {
    throw mkErr('invalid ciphertext')
  }
  const packed = fromBase64Url(raw)
  if (
    packed.byteLength < gcmIvBytes + gcmTagBytes ||
    toBase64Url(packed) !== raw
  ) {
    throw mkErr('invalid ciphertext')
  }
  return decodeBytes(
    await crypto.subtle.decrypt(
      gcmParams(packed.subarray(0, gcmIvBytes), aad),
      await keyP,
      packed.subarray(gcmIvBytes)                
    )
  )
}
