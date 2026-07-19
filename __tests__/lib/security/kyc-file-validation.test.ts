import { describe, it, expect } from "vitest"
import { validateKycFile, KYC_MAX_FILE_SIZE } from "@/lib/security/kyc-file-validation"

function jpegHeader(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
}

function pngHeader(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
}

function webpHeader(): Buffer {
  const buf = Buffer.alloc(20)
  buf.write("RIFF", 0)
  buf.writeUInt32LE(100, 4)
  buf.write("WEBP", 8)
  buf.write("VP8 ", 12)
  return buf
}

function pdfHeader(): Buffer {
  return Buffer.from("%PDF-1.4 test content")
}

describe("validateKycFile", () => {
  describe("valid file signatures", () => {
    it("accepts valid JPEG", () => {
      const buffer = jpegHeader()
      const result = validateKycFile(buffer, "image/jpeg", "photo.jpg")
      expect(result.valid).toBe(true)
      expect(result.detectedMimeType).toBe("image/jpeg")
      expect(result.checksumSha256).toBeTruthy()
    })

    it("accepts valid PNG", () => {
      const buffer = pngHeader()
      const result = validateKycFile(buffer, "image/png", "document.png")
      expect(result.valid).toBe(true)
      expect(result.detectedMimeType).toBe("image/png")
    })

    it("accepts valid WebP", () => {
      const buffer = webpHeader()
      const result = validateKycFile(buffer, "image/webp", "image.webp")
      expect(result.valid).toBe(true)
      expect(result.detectedMimeType).toBe("image/webp")
    })

    it("accepts valid PDF", () => {
      const buffer = pdfHeader()
      const result = validateKycFile(buffer, "application/pdf", "document.pdf")
      expect(result.valid).toBe(true)
      expect(result.detectedMimeType).toBe("application/pdf")
    })
  })

  describe("invalid file signatures", () => {
    it("rejects mismatched MIME type", () => {
      const buffer = jpegHeader()
      const result = validateKycFile(buffer, "image/png", "photo.jpg")
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes("does not match detected type"))).toBe(true)
    })

    it("rejects empty file", () => {
      const result = validateKycFile(Buffer.alloc(0), "image/jpeg", "empty.jpg")
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain("empty")
    })

    it("rejects unrecognized file type", () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00])
      const result = validateKycFile(buffer, "image/jpeg", "unknown.jpg")
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes("Unable to detect"))).toBe(true)
    })

    it("rejects disallowed extension", () => {
      const buffer = jpegHeader()
      const result = validateKycFile(buffer, "image/jpeg", "script.exe")
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes("extension"))).toBe(true)
    })

    it("rejects disallowed MIME type", () => {
      const buffer = Buffer.from("not-a-file")
      const result = validateKycFile(buffer, "text/html", "page.html")
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes("not allowed"))).toBe(true)
    })

    it("rejects extension mismatch", () => {
      const buffer = jpegHeader()
      const result = validateKycFile(buffer, "image/jpeg", "photo.png")
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes("extension"))).toBe(true)
    })
  })

  describe("file size validation", () => {
    it("rejects oversized file", () => {
      const buffer = Buffer.alloc(KYC_MAX_FILE_SIZE + 1)
      jpegHeader().copy(buffer)
      const result = validateKycFile(buffer, "image/jpeg", "big.jpg")
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes("size"))).toBe(true)
    })

    it("accepts file at max size", () => {
      const buffer = Buffer.alloc(KYC_MAX_FILE_SIZE)
      jpegHeader().copy(buffer)
      const result = validateKycFile(buffer, "image/jpeg", "max.jpg")
      expect(result.valid).toBe(true)
    })
  })

  describe("checksum", () => {
    it("returns consistent checksum for same content", () => {
      const buffer = pngHeader()
      const r1 = validateKycFile(buffer, "image/png", "a.png")
      const r2 = validateKycFile(buffer, "image/png", "b.png")
      expect(r1.checksumSha256).toBe(r2.checksumSha256)
    })

    it("returns different checksum for different content", () => {
      const r1 = validateKycFile(pngHeader(), "image/png", "a.png")
      const r2 = validateKycFile(jpegHeader(), "image/jpeg", "a.jpg")
      expect(r1.checksumSha256).not.toBe(r2.checksumSha256)
    })
  })
})
