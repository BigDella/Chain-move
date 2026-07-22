import { IReconciliationDiscrepancy } from "@/models/ReconciliationDiscrepancy"

const PII_KEYS = ["email", "phone", "phoneNumber", "address", "fullName", "name", "password", "secret"]

/**
 * Recursively redacts sensitive PII fields from strings, arrays, and objects.
 */
export function redactPii<T>(input: T): T {
  if (input === null || input === undefined) return input

  if (typeof input === "string") {
    let redacted = input.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[REDACTED_EMAIL]",
    )
    redacted = redacted.replace(
      /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
      "[REDACTED_PHONE]",
    )
    return redacted as T
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactPii(item)) as T
  }

  if (typeof input === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const isPiiKey = PII_KEYS.some((pii) => key.toLowerCase().includes(pii.toLowerCase()))
      if (isPiiKey) {
        output[key] = "[REDACTED]"
      } else {
        output[key] = redactPii(value)
      }
    }
    return output as T
  }

  return input
}

export interface ReconciliationReportSummary {
  runId: string
  periodStart: string
  periodEnd: string
  totalDiscrepancies: number
  byCategory: Record<string, number>
  byStatus: Record<string, number>
  discrepancies: Array<{
    id: string
    fingerprint: string
    category: string
    providerReference?: string
    providerAmount?: number
    providerStatus?: string
    internalTransactionId?: string
    internalAmount?: number
    internalStatus?: string
    explanation: string
    remediationStatus: string
    createdAt: string
  }>
}

export function generateReconciliationJsonSummary(
  runId: string,
  periodStart: Date,
  periodEnd: Date,
  discrepancies: Array<IReconciliationDiscrepancy | Record<string, any>>,
): ReconciliationReportSummary {
  const summary: ReconciliationReportSummary = {
    runId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalDiscrepancies: discrepancies.length,
    byCategory: {},
    byStatus: {},
    discrepancies: [],
  }

  for (const d of discrepancies) {
    const category = d.category || "UNKNOWN"
    const status = d.remediationStatus || "unresolved"

    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1

    summary.discrepancies.push({
      id: d._id ? d._id.toString() : d.id || "",
      fingerprint: d.fingerprint,
      category,
      providerReference: d.providerReference,
      providerAmount: d.providerAmount,
      providerStatus: d.providerStatus,
      internalTransactionId: d.internalTransactionId,
      internalAmount: d.internalAmount,
      internalStatus: d.internalStatus,
      explanation: redactPii(d.explanation || ""),
      remediationStatus: status,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    })
  }

  return summary
}

export function generateReconciliationCsvExport(
  discrepancies: Array<IReconciliationDiscrepancy | Record<string, any>>,
): string {
  const headers = [
    "ID",
    "Fingerprint",
    "RunID",
    "Category",
    "ProviderReference",
    "ProviderAmount",
    "ProviderStatus",
    "InternalTransactionID",
    "InternalAmount",
    "InternalStatus",
    "RemediationStatus",
    "Explanation",
  ]

  const rows = discrepancies.map((d) => {
    const id = d._id ? d._id.toString() : d.id || ""
    const explanation = redactPii(d.explanation || "").replace(/"/g, '""')
    return [
      `"${id}"`,
      `"${d.fingerprint || ""}"`,
      `"${d.runId || ""}"`,
      `"${d.category || ""}"`,
      `"${d.providerReference || ""}"`,
      d.providerAmount || 0,
      `"${d.providerStatus || ""}"`,
      `"${d.internalTransactionId || ""}"`,
      d.internalAmount || 0,
      `"${d.internalStatus || ""}"`,
      `"${d.remediationStatus || "unresolved"}"`,
      `"${explanation}"`,
    ].join(",")
  })

  return [headers.join(","), ...rows].join("\n")
}
