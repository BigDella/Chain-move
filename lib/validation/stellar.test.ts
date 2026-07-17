import { describe, expect, it } from "vitest"
import { isValidStellarPublicKey, normalizeStellarPublicKey } from "./stellar"

// A well-known, real Stellar public account used widely in Stellar SDK fixtures.
// Validating against an externally-produced key proves the CRC16 checksum logic
// is correct rather than merely self-consistent.
const REAL_STELLAR_PUBLIC_KEY = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H"

describe("isValidStellarPublicKey", () => {
  it("accepts a valid Stellar public account", () => {
    expect(isValidStellarPublicKey(REAL_STELLAR_PUBLIC_KEY)).toBe(true)
  })

  it("rejects a key with a tampered checksum", () => {
    const tampered = REAL_STELLAR_PUBLIC_KEY.slice(0, -1) + (REAL_STELLAR_PUBLIC_KEY.endsWith("H") ? "I" : "H")
    expect(isValidStellarPublicKey(tampered)).toBe(false)
  })

  it("rejects values with the wrong prefix, length, or alphabet", () => {
    expect(isValidStellarPublicKey("")).toBe(false)
    expect(isValidStellarPublicKey("not-a-key")).toBe(false)
    expect(isValidStellarPublicKey(REAL_STELLAR_PUBLIC_KEY.toLowerCase())).toBe(false)
    expect(isValidStellarPublicKey(REAL_STELLAR_PUBLIC_KEY.slice(1))).toBe(false)
    expect(isValidStellarPublicKey("M" + REAL_STELLAR_PUBLIC_KEY.slice(1))).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isValidStellarPublicKey(undefined)).toBe(false)
    expect(isValidStellarPublicKey(null)).toBe(false)
    expect(isValidStellarPublicKey(123)).toBe(false)
  })
})

describe("normalizeStellarPublicKey", () => {
  it("trims surrounding whitespace without changing case", () => {
    expect(normalizeStellarPublicKey(`  ${REAL_STELLAR_PUBLIC_KEY}  `)).toBe(REAL_STELLAR_PUBLIC_KEY)
  })
})
