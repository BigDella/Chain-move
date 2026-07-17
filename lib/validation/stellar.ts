// Stellar public account (ed25519 public key) validation.
//
// A Stellar public account is encoded with StrKey: a base32 string that starts
// with "G", is 56 characters long, and packs a 1-byte version, the 32-byte raw
// key, and a 2-byte CRC16 (XModem) checksum stored little-endian. We validate
// the full structure here so malformed or mistyped values are rejected before
// they ever reach the database.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const STRKEY_LENGTH = 56
const ED25519_PUBLIC_KEY_VERSION_BYTE = 6 << 3 // 48 -> encodes to "G"
const STRKEY_FORMAT = /^G[A-Z2-7]{55}$/

export function normalizeStellarPublicKey(value: string): string {
  // StrKey is case-sensitive base32, so we only trim surrounding whitespace.
  return value.trim()
}

function decodeBase32(input: string): Uint8Array | null {
  let bits = 0
  let value = 0
  const output: number[] = []

  for (const char of input) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) return null

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bits -= 8
      output.push((value >>> bits) & 0xff)
    }
  }

  return new Uint8Array(output)
}

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0x0000

  for (const byte of bytes) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }

  return crc
}

export function isValidStellarPublicKey(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (value.length !== STRKEY_LENGTH) return false
  if (!STRKEY_FORMAT.test(value)) return false

  const decoded = decodeBase32(value)
  if (!decoded || decoded.length !== 35) return false
  if (decoded[0] !== ED25519_PUBLIC_KEY_VERSION_BYTE) return false

  const payload = decoded.subarray(0, 33)
  const checksum = decoded[33] | (decoded[34] << 8)
  return crc16xmodem(payload) === checksum
}
