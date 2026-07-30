import { createHash } from "crypto"

export const KYC_MAX_FILE_SIZE = 10 * 1024 * 1024

export const KYC_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
])

export const KYC_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"])

const SIGNATURES: { mime: string; extension: string[]; bytes: Buffer; offset: number }[] = [
  {
    mime: "image/jpeg",
    extension: [".jpg", ".jpeg"],
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
    offset: 0,
  },
  {
    mime: "image/png",
    extension: [".png"],
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    offset: 0,
  },
  {
    mime: "image/webp",
    extension: [".webp"],
    bytes: Buffer.from("RIFF"),
    offset: 0,
  },
  {
    mime: "application/pdf",
    extension: [".pdf"],
    bytes: Buffer.from("%PDF"),
    offset: 0,
  },
]

function detectMimeType(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.mime === "image/webp") {
      if (buffer.length >= 12 && buffer.subarray(0, 4).equals(sig.bytes) && buffer.subarray(8, 12).equals(Buffer.from("WEBP"))) {
        return sig.mime
      }
      continue
    }
    if (buffer.subarray(sig.offset, sig.offset + sig.bytes.length).equals(sig.bytes)) {
      return sig.mime
    }
  }
  return null
}

function detectExtension(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.mime === "image/webp") {
      if (buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from("RIFF")) && buffer.subarray(8, 12).equals(Buffer.from("WEBP"))) {
        return ".webp"
      }
      continue
    }
    if (buffer.subarray(sig.offset, sig.offset + sig.bytes.length).equals(sig.bytes)) {
      return sig.extension[0]
    }
  }
  return null
}

export type FileValidationResult = {
  valid: boolean
  errors: string[]
  detectedMimeType: string | null
  detectedExtension: string | null
  checksumSha256: string
}

export function validateKycFile(
  buffer: Buffer,
  declaredMimeType: string,
  declaredFilename: string,
): FileValidationResult {
  const errors: string[] = []
  const checksumSha256 = createHash("sha256").update(buffer).digest("hex")

  if (buffer.length === 0) {
    return { valid: false, errors: ["File is empty."], detectedMimeType: null, detectedExtension: null, checksumSha256 }
  }

  if (buffer.length > KYC_MAX_FILE_SIZE) {
    errors.push(`File exceeds maximum size of ${KYC_MAX_FILE_SIZE} bytes.`)
  }

  if (!KYC_ALLOWED_MIME_TYPES.has(declaredMimeType)) {
    errors.push(`Declared MIME type "${declaredMimeType}" is not allowed.`)
  }

  const declaredExt = declaredFilename.includes(".")
    ? "." + declaredFilename.split(".").pop()?.toLowerCase()
    : null
  if (declaredExt && !KYC_ALLOWED_EXTENSIONS.has(declaredExt)) {
    errors.push(`File extension "${declaredExt}" is not allowed.`)
  }

  const detectedMimeType = detectMimeType(buffer)
  const detectedExtension = detectExtension(buffer)

  if (!detectedMimeType) {
    errors.push("Unable to detect file type from content. File may be corrupted or unsupported.")
  } else if (detectedMimeType !== declaredMimeType) {
    errors.push(
      `Declared type "${declaredMimeType}" does not match detected type "${detectedMimeType}". File signature mismatch.`,
    )
  }

  if (detectedExtension && declaredExt && detectedExtension !== declaredExt) {
    errors.push(
      `Declared extension "${declaredExt}" does not match detected type "${detectedExtension}".`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    detectedMimeType,
    detectedExtension,
    checksumSha256,
  }
}
