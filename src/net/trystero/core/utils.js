import {createEventEmitter, initSingleHandler} from './emitter.js'
                                                                   
import {
  base62Alphabet,
  base64UrlRe,
  createBoundedCache,
  createBoundedSet,
  decodeBytes,
  domainTag,
  encodeBytes,
  encodeBytesInto,
  fromBase64Url,
  fromJson,
  hash32,
  libId,
  libName,
  mkErr,
  toBase64Url,
  toJson,
  unreachable,
  userIdLength,
  utf8ByteLength
} from './primitives.js'
                                                         

export {
  base64UrlRe,
  createBoundedCache,
  createBoundedSet,
  createEventEmitter,
  decodeBytes,
  domainTag,
  encodeBytes,
  encodeBytesInto,
  fromBase64Url,
  fromJson,
  initSingleHandler,
  libId,
  libName,
  mkErr,
  toBase64Url,
  toJson,
  unreachable,
  utf8ByteLength
}

export const lockMethods =                   (
  target   ,
  methodNames                               
)    => {
  for (const name of methodNames) {
    const fn = target[name]
    Object.defineProperty(target, name, {
      get: () => fn,
      set: () => {
        throw new TypeError(
          `${libName}: ${name} is a method; call ${name}(handler), which returns an unsubscribe function`
        )
      },
      enumerable: true,
      configurable: true
    })
  }
  return target
}

export const authMetaKey         = `__${libId}Auth`
export const cmpStr = (a        , b        )         =>
  a < b ? -1 : a > b ? 1 : 0
export const internalActionPrefix = '@_'

export const warn = (msg        )       => console.warn(`${libName}: ${msg}`)

export const warnNoPeer = (id        )       =>
  warn(`no peer with id ${id} found`)

export const warnEphemeralAdmin = ()       =>
  warn(
    "roles({selfAsAdmin: true}) with an ephemeral identity orphans the room on close; use identity: 'local' or an imported UserIdentity"
  )

export const logErr = (kind        , err         )       =>
  console.error(`${libName} ${kind} error:`, err)

export const logActionHandlerErr = (err         )       =>
  logErr('action handler', err)

export const peerDisconnectedMsg = 'peer disconnected'
export const peerDisconnectedErr        =
  /*@__PURE__*/ mkErr(peerDisconnectedMsg)
export const peerBannedMsg = 'peer banned'
export const peerBannedErr        = /*@__PURE__*/ mkErr(peerBannedMsg)
export const mkBannedErr = (
  reason         ,
  peerId         
)                       => ({
  code: 'banned',
  message: reason ? `${peerBannedMsg}: ${reason}` : peerBannedMsg,
  ...(reason !== undefined ? {reason} : {}),
  ...(peerId ? {peerId} : {})
})
export const peerLeftRoomErr        = /*@__PURE__*/ mkErr('peer left room')
export const roomLeftErr        = /*@__PURE__*/ mkErr('room left')
export const roomFullMsg = 'room full'
export const roomFullErr        = /*@__PURE__*/ mkErr(roomFullMsg)
export const operationAbortedMsg = 'operation aborted'
export const insufficientAuthPrefix = 'insufficient authority'
export const invalidP256KeyErr        = /*@__PURE__*/ mkErr(
  'invalid ECDSA P-256 public key'
)

export const posSafeIntErr = (name        )        =>
  mkErr(`${name} must be a positive safe integer`)

export const requiresRolesErr = (feature        )        =>
  mkErr(`${feature} requires roles() in joinRoom config`)

export const selfCertRoomRolesErr        = /*@__PURE__*/ requiresRolesErr(
  'self-certifying room ID'
)

export const actionRedefinedErr = (type        )        =>
  mkErr(`action type "${type}" cannot be redefined`)

export const invalidActionMsg = (what        )         =>
  `invalid action ${what}`

export const noActivePeerMsg = (id        )         =>
  `no active peer with id ${id}`

export const requiredErr = (field        )        =>
  mkErr(`${field} is required`)

const {floor} = Math

export const alloc =    (n        , f                                )      =>
  Array(n).fill(undefined).map(f)

const base62UnbiasedLimit = 248 // 62 * 4 (largest multiple of 62 <= 256)

export const genId = (n        )         => {
  if (n <= 0) {
    return ''
  }
  const buf = new Uint8Array(Math.ceil(n * 1.15) + 4)
  let out = ''
  while (out.length < n) {
    crypto.getRandomValues(buf)
    for (let i = 0; i < buf.byteLength && out.length < n; i++) {
      const b = buf[i] 
      if (b < base62UnbiasedLimit) {
        out += base62Alphabet[b % 62] 
      }
    }
  }
  return out
}

export const all                     = /*@__PURE__*/ Promise.all.bind(Promise)

export const isBrowser          = typeof window !== 'undefined'

export const entries                        = Object.entries
export const fromEntries                            = Object.fromEntries
export const keys                     = Object.keys
export const values                       = Object.values

export const noOp = ()       => {}

export const candidateType = 'candidate'

export const resetTimer = (timer                            )       => {
  if (timer !== null && timer !== undefined) {
    clearTimeout(timer)
  }

  return null
}

export const unrefTimer = (t         )       => {
  ;(t                        )?.unref?.()
}

export const toErrorMessage = (reason         , fallback        )         => {
  if (reason instanceof Error && reason.message) {
    return reason.message
  }

  if (typeof reason === 'string' && reason) {
    return reason
  }

  return toJson(reason ?? fallback)
}

export const toError = (reason         , fallback        )        =>
  reason instanceof Error ? reason : mkErr(toErrorMessage(reason, fallback))

export const topicPath = (...parts          )         => toJson(parts)

export const shuffle =    (xs              , seed        )      => {
  const a = [...xs]
  let state = (Math.trunc(seed) || 1) >>> 0
  const rand = ()         => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000
  }

  let i = a.length

  while (i) {
    const j = floor(rand() * i--)
    const tmp = a[i]
    a[i] = a[j]     
    a[j] = tmp     
  }

  return a
}

export const strToNum = (
  str        ,
  limit         = Number.MAX_SAFE_INTEGER
)         => hash32(str) % limit

const protocolViolations = /*@__PURE__*/ new WeakSet       ()

export const markProtocolViolation = (err       )        => {
  protocolViolations.add(err)
  return err
}

export const isProtocolViolation = (err         )          =>
  err instanceof Error && protocolViolations.has(err)

export const mkViolationErr = (msg        )        =>
  markProtocolViolation(mkErr(msg))

export const userIdRegex         = /*@__PURE__*/ new RegExp(
  `^[0-9A-Za-z]{${userIdLength}}$`
)

export const selfCertifyingRoomRegex         = /*@__PURE__*/ new RegExp(
  `^(.+)~([0-9A-Za-z]{${userIdLength}})$`
)

export const splitSelfCertRoom = (
  roomId        
)                                              => {
  const match = selfCertifyingRoomRegex.exec(roomId)
  return match?.[1] && match[2] ? [match[1], match[2]] : [roomId, null]
}

export const formatSelfCertifyingRoomId = (
  base        ,
  userId        
)         => `${splitSelfCertRoom(base)[0]}~${userId}`

export const toPayloadSource = (
  data             
)                                                          => {
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return [2, data]
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return [
      2,
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    ]
  }
  const isText = typeof data === 'string'
  return [isText ? 0 : 1, encodeBytes(isText ? data : toJson(data))]
}

export const hasIceUrl = (
  servers                         ,
  pattern        
)          =>
  servers.some(({urls}) => [urls].flat().some(url => pattern.test(url)))

export const isObj = (v         )                               =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v))

export const isStr = (v         )              =>
  typeof v === 'string' && v.length > 0

export const isPosSafeInt = (n         )              =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0

export const isValidSig = (s         )              =>
  typeof s === 'string' && s.length >= 64 && s.length <= 128

export const validateRoleCertificateShape = (
  c         
)                       =>
  isObj(c) &&
  c['v'] === 1 &&
  isStr(c['certId']) &&
  isStr(c['issuerPubKey']) &&
  isStr(c['subUserId']) &&
  isStr(c['appId']) &&
  isStr(c['roomId']) &&
  Array.isArray(c['roles']) &&
  c['roles'].length > 0 &&
  c['roles'].every(isStr) &&
  isPosSafeInt(c['seq']) &&
  isPosSafeInt(c['iat']) &&
  isValidSig(c['sig'])

                                      
                               
                              
                               
 

export const createWindowCounter = (
  maxEntries        ,
  limit        ,
  windowMs = 30_000
)                => {
  const map = createBoundedCache                                (maxEntries)
  return [
    id => {
      const now = Date.now()
      let cur = map.get(id)
      if (!cur || now - cur[1] > windowMs) {
        cur = [0, now]
        map.set(id, cur)
      }
      return ++cur[0] >= limit
    },
    id => {
      map.delete(id)
    },
    id => {
      const cur = map.get(id)
      return Boolean(cur && Date.now() - cur[1] <= windowMs && cur[0] >= limit)
    }
  ]
}
