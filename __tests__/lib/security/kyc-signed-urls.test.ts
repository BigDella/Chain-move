import { describe, it, expect, beforeEach } from "vitest"
import {
  createSignedDocumentUrl,
  verifySignedDocumentUrl,
} from "@/lib/security/kyc-signed-urls"

describe("kyc-signed-urls", () => {
  const documentId = "doc_123"
  const userId = "user_456"

  describe("createSignedDocumentUrl", () => {
    it("returns a URL with token parameter", () => {
      const { url } = createSignedDocumentUrl(documentId, userId)
      expect(url).toContain(`/api/kyc-documents/${documentId}?token=`)
    })

    it("returns a valid expiry timestamp", () => {
      const { expiresAt } = createSignedDocumentUrl(documentId, userId)
      expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
      expect(expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 360)
    })

    it("respects custom TTL", () => {
      const { expiresAt } = createSignedDocumentUrl(documentId, userId, 120)
      const now = Math.floor(Date.now() / 1000)
      expect(expiresAt).toBeGreaterThanOrEqual(now + 119)
      expect(expiresAt).toBeLessThanOrEqual(now + 121)
    })
  })

  describe("verifySignedDocumentUrl", () => {
    it("validates a correctly signed token", () => {
      const { url } = createSignedDocumentUrl(documentId, userId)
      const token = new URL(url, "http://localhost").searchParams.get("token")!
      const result = verifySignedDocumentUrl(token)
      expect(result.valid).toBe(true)
      expect(result.payload?.documentId).toBe(documentId)
      expect(result.payload?.userId).toBe(userId)
    })

    it("rejects tampered payload", () => {
      const { url } = createSignedDocumentUrl(documentId, userId)
      const token = new URL(url, "http://localhost").searchParams.get("token")!
      const parts = token.split("|")
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString())
      payload.userId = "tampered_user"
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
      const tamperedToken = `${tamperedPayload}|${parts[1]}`
      const result = verifySignedDocumentUrl(tamperedToken)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("Invalid signature")
    })

    it("rejects expired token", () => {
      const { url } = createSignedDocumentUrl(documentId, userId, 1)
      const token = new URL(url, "http://localhost").searchParams.get("token")!
      const parts = token.split("|")
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString())
      payload.expiresAt = Math.floor(Date.now() / 1000) - 10
      const expiredPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
      const expiredToken = `${expiredPayload}|${parts[1]}`
      const result = verifySignedDocumentUrl(expiredToken)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("expired")
    })

    it("rejects malformed token", () => {
      expect(verifySignedDocumentUrl("garbage").valid).toBe(false)
      expect(verifySignedDocumentUrl("a|b|c").valid).toBe(false)
      expect(verifySignedDocumentUrl("").valid).toBe(false)
    })

    it("rejects token with invalid base64", () => {
      expect(verifySignedDocumentUrl("!!!invalid!!!|signature").valid).toBe(false)
    })
  })
})
