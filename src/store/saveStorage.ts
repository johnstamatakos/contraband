/**
 * HMAC-signed async Zustand storage.
 *
 * Every write is signed with a SHA-256 HMAC; every read verifies the signature.
 * If the stored data has been manually edited (signature mismatch), the save is
 * silently dropped and the store falls back to a fresh initial state.
 */

// Key material split across multiple strings to resist simple text-search in DevTools
const _a = 'cb', _b = 'and', _c = '-sv', _d = '-k25'
const _KEY = _a + _b + _c + _d

let _cryptoKey: CryptoKey | null = null

async function getCryptoKey(): Promise<CryptoKey> {
  if (_cryptoKey) return _cryptoKey
  _cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return _cryptoKey
}

async function signData(data: string): Promise<string> {
  const key = await getCryptoKey()
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

async function verifyData(data: string, sig: string): Promise<boolean> {
  try {
    const key = await getCryptoKey()
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data))
  } catch {
    return false
  }
}

export const saveStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const raw = localStorage.getItem(name)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { d?: string; s?: string }
      if (!parsed.d || !parsed.s) return null
      const valid = await verifyData(parsed.d, parsed.s)
      if (!valid) {
        localStorage.removeItem(name)
        return null
      }
      return parsed.d
    } catch {
      return null
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    const s = await signData(value)
    localStorage.setItem(name, JSON.stringify({ d: value, s }))
  },

  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name)
  },
}
