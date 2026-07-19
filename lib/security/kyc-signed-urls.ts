import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { parseAppConfig } from "@/lib/config/schema"

const SIGNED_URL_TTL_SECONDS = 5 * 60
const SIGNED_URL_SEPARATOR = "|"

function getSigningSecret(): string {
  const config = parseAppConfig(process.env)
  return config.JWT_SECRET || config.AUTH_SESSION_SECRET || config.KYC_DOCUMENT_ENCRYPTION_KEY || "fallback-signing-key"
}

export type SignedUrlPayload = {
  documentId: string
  userId: string
  expiresAt: number
  nonce: string
}

export function createSignedDocumentUrl(
  documentId: string,
  userId: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): { url: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const nonce = randomBytes(16).toString("hex")

  const payload: SignedUrlPayload = {
    documentId,
    userId,
    expiresAt,
    nonce,
  }

  const payloadJson = JSON.stringify(payload)
  const payloadBase64 = Buffer.from(payloadJson).toString("base64url")
  const signature = createHmac("sha256", getSigningSecret()).update(payloadBase64).digest("base64url")

  const token = `${payloadBase64}${SIGNED_URL_SEPARATOR}${signature}`
  const url = `/api/kyc-documents/${documentId}?token=${encodeURIComponent(token)}`

  return { url, expiresAt }
}

export function verifySignedDocumentUrl(
  token: string,
): { valid: boolean; payload?: SignedUrlPayload; error?: string } {
  const parts = token.split(SIGNED_URL_SEPARATOR)
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid token format." }
  }

  const [payloadBase64, signatureBase64] = parts

  const expectedSignature = createHmac("sha256", getSigningSecret()).update(payloadBase64).digest("base64url")

  let signatureValid = false
  try {
    const sigBuf = Buffer.from(signatureBase64, "base64url")
    const expectedBuf = Buffer.from(expectedSignature, "base64url")
    if (sigBuf.length === expectedBuf.length) {
      signatureValid = timingSafeEqual(sigBuf, expectedBuf)
    }
  } catch {
    return { valid: false, error: "Invalid signature." }
  }

  if (!signatureValid) {
    return { valid: false, error: "Invalid signature." }
  }

  let payload: SignedUrlPayload
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"))
  } catch {
    return { valid: false, error: "Invalid payload." }
  }

  if (!payload.documentId || !payload.userId || !payload.expiresAt || !payload.nonce) {
    return { valid: false, error: "Incomplete payload." }
  }

  if (Math.floor(Date.now() / 1000) > payload.expiresAt) {
    return { valid: false, error: "Signed URL has expired." }
  }

  return { valid: true, payload }
}

export const DOCUMENT_URL_TTL_SECONDS = SIGNED_URL_TTL_SECONDS
