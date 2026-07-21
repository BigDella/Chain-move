import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import mongoose from "mongoose"
import ReconciliationRun from "@/models/ReconciliationRun"
import ReconciliationDiscrepancy from "@/models/ReconciliationDiscrepancy"
import Transaction from "@/models/Transaction"
import DriverVirtualAccount from "@/models/DriverVirtualAccount"
import User from "@/models/User"
import AuditLog from "@/models/AuditLog"
import { MockPaystackAdapter } from "@/lib/paystack/mockAdapter"
import { PaystackAdapter } from "@/lib/paystack/paystackAdapter"
import { PaystackTransactionRecord } from "@/lib/paystack/types"
import {
  createDiscrepancyFingerprint,
  remediateDiscrepancy,
  runReconciliation,
} from "@/lib/reconciliation/reconciliationEngine"
import { redactPii } from "@/lib/reconciliation/reporting"
import axios from "axios"

vi.mock("axios")

describe("Paystack Settlement Reconciliation Subsystem Tests (#99)", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(
          process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chainmove-test",
          { serverSelectionTimeoutMS: 2000 },
        )
      } catch (err) {
        console.warn("MongoDB connection warning in test environment:", err)
      }
    }
  }, 10000)

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close()
    }
  })

  afterEach(async () => {
    vi.clearAllMocks()
    if (mongoose.connection.readyState !== 0) {
      await ReconciliationRun.deleteMany({})
      await ReconciliationDiscrepancy.deleteMany({})
      await Transaction.deleteMany({})
      await DriverVirtualAccount.deleteMany({})
      await User.deleteMany({})
      await AuditLog.deleteMany({})
    }
  })

  it("should compute deterministic SHA-256 fingerprints for discrepancy deduplication", () => {
    const fp1 = createDiscrepancyFingerprint("MISSING_INTERNAL_RECORD", "REF-001", "", 50000)
    const fp2 = createDiscrepancyFingerprint("MISSING_INTERNAL_RECORD", "REF-001", "", 50000)
    const fp3 = createDiscrepancyFingerprint("AMOUNT_MISMATCH", "REF-001", "", 50000)

    expect(fp1).toBe(fp2)
    expect(fp1).not.toBe(fp3)
    expect(fp1.length).toBe(64) // SHA-256 length
  })

  it("should sanitize PII strings, objects, and email/phone patterns in reporting", () => {
    const input = {
      email: "payer@example.com",
      notes: "Contact customer at john.doe@domain.com or +2348012345678",
      nested: {
        phone: "+2348000000000",
        amount: 25000,
      },
    }

    const sanitized = redactPii(input)
    expect(sanitized.email).toBe("[REDACTED]")
    expect(sanitized.nested.phone).toBe("[REDACTED]")
    expect(sanitized.nested.amount).toBe(25000)
    expect(sanitized.notes).toContain("[REDACTED_EMAIL]")
    expect(sanitized.notes).toContain("[REDACTED_PHONE]")
  })

  it("should handle transient HTTP 429/5xx provider errors with retries in PaystackAdapter", async () => {
    const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> }
    mockedAxios.get
      .mockRejectedValueOnce({ response: { status: 429, data: { message: "Rate limit exceeded" } } })
      .mockResolvedValueOnce({
        data: {
          status: true,
          message: "Success",
          data: [],
          meta: { total: 0, skipped: 0, perPage: 50, page: 1, pageCount: 1 },
        },
      })

    const adapter = new PaystackAdapter("sk_test_123", 2)
    const result = await adapter.fetchTransactions({ page: 1, perPage: 50 })

    expect(result.status).toBe(true)
    expect(mockedAxios.get).toHaveBeenCalledTimes(2)
  })

  it("should detect MISSING_INTERNAL_RECORD when Paystack has record but internal DB does not", async () => {
    if (mongoose.connection.readyState !== 1) return

    const mockRecord: PaystackTransactionRecord = {
      id: 101,
      domain: "test",
      status: "success",
      reference: "PAYSTACK-REF-101",
      amount: 5000000, // 50,000 NGN in kobo
      gateway_response: "Successful",
      created_at: new Date().toISOString(),
      channel: "card",
      currency: "NGN",
      customer: { id: 1, email: "driver1@example.com", customer_code: "CUS_1" },
    }

    const adapter = new MockPaystackAdapter([mockRecord])
    const start = new Date(Date.now() - 3600000)
    const end = new Date(Date.now() + 3600000)

    const res = await runReconciliation(start, end, adapter)
    expect(res.run.status).toBe("completed")
    expect(res.discrepancies.length).toBe(1)
    expect(res.discrepancies[0].category).toBe("MISSING_INTERNAL_RECORD")
    expect(res.discrepancies[0].providerReference).toBe("PAYSTACK-REF-101")
    expect(res.discrepancies[0].providerAmount).toBe(50000)
  })

  it("should detect MISSING_PROVIDER_RECORD when internal transaction has ref but Paystack returns nothing", async () => {
    if (mongoose.connection.readyState !== 1) return

    const dummyUser = await User.create({
      fullName: "Test Driver",
      email: "driver2@example.com",
      role: "driver",
    })

    const start = new Date(Date.now() - 3600000)
    const end = new Date(Date.now() + 3600000)

    await Transaction.create({
      userId: dummyUser._id,
      userType: "driver",
      type: "wallet_funding",
      amount: 35000,
      currency: "NGN",
      gatewayReference: "MISSING-PROVIDER-REF-999",
      status: "Completed",
      timestamp: new Date(),
    })

    const adapter = new MockPaystackAdapter([]) // Empty provider records
    const res = await runReconciliation(start, end, adapter)

    const missingDisc = res.discrepancies.find((d) => d.category === "MISSING_PROVIDER_RECORD")
    expect(missingDisc).toBeDefined()
    expect(missingDisc?.providerReference).toBe("MISSING-PROVIDER-REF-999")
  })

  it("should detect AMOUNT_MISMATCH, STATUS_MISMATCH, and REVERSAL_REFUND", async () => {
    if (mongoose.connection.readyState !== 1) return

    const dummyUser = await User.create({
      fullName: "Test Investor",
      email: "investor@example.com",
      role: "investor",
    })

    const tx1 = await Transaction.create({
      userId: dummyUser._id,
      userType: "investor",
      type: "investment",
      amount: 100000,
      gatewayReference: "REF-AMOUNT-MISMATCH",
      status: "Completed",
      timestamp: new Date(),
    })

    const tx2 = await Transaction.create({
      userId: dummyUser._id,
      userType: "investor",
      type: "investment",
      amount: 50000,
      gatewayReference: "REF-STATUS-REVERSED",
      status: "Completed",
      timestamp: new Date(),
    })

    const mockRecords: PaystackTransactionRecord[] = [
      {
        id: 201,
        domain: "test",
        status: "success",
        reference: "REF-AMOUNT-MISMATCH",
        amount: 8000000, // 80,000 NGN (differs from 100,000 NGN)
        gateway_response: "Successful",
        created_at: new Date().toISOString(),
        channel: "card",
        currency: "NGN",
      },
      {
        id: 202,
        domain: "test",
        status: "reversed", // Paystack reversed after completion
        reference: "REF-STATUS-REVERSED",
        amount: 5000000,
        gateway_response: "Reversed",
        created_at: new Date().toISOString(),
        channel: "card",
        currency: "NGN",
      },
    ]

    const adapter = new MockPaystackAdapter(mockRecords)
    const start = new Date(Date.now() - 3600000)
    const end = new Date(Date.now() + 3600000)

    const res = await runReconciliation(start, end, adapter)

    const amtMismatch = res.discrepancies.find((d) => d.category === "AMOUNT_MISMATCH")
    const reversalDisc = res.discrepancies.find((d) => d.category === "REVERSAL_REFUND")

    expect(amtMismatch).toBeDefined()
    expect(amtMismatch?.internalAmount).toBe(100000)
    expect(amtMismatch?.providerAmount).toBe(80000)

    expect(reversalDisc).toBeDefined()
    expect(reversalDisc?.providerStatus).toBe("reversed")
  })

  it("should enforce idempotency on repeated reconciliation runs", async () => {
    if (mongoose.connection.readyState !== 1) return

    const mockRecord: PaystackTransactionRecord = {
      id: 301,
      domain: "test",
      status: "success",
      reference: "IDEMPOTENT-REF-777",
      amount: 2500000,
      gateway_response: "Successful",
      created_at: new Date().toISOString(),
      channel: "card",
      currency: "NGN",
    }

    const adapter = new MockPaystackAdapter([mockRecord])
    const start = new Date(Date.now() - 3600000)
    const end = new Date(Date.now() + 3600000)

    const res1 = await runReconciliation(start, end, adapter)
    const res2 = await runReconciliation(start, end, adapter)

    expect(res1.discrepancies.length).toBe(1)
    expect(res2.discrepancies.length).toBe(1)

    const totalDiscDocs = await ReconciliationDiscrepancy.countDocuments({})
    expect(totalDiscDocs).toBe(1) // Fingerprint deduplication prevented duplicates
  })

  it("should execute authorized remediation and log audit entries", async () => {
    if (mongoose.connection.readyState !== 1) return

    const reviewer = await User.create({
      fullName: "Admin Reviewer",
      email: "admin@chainmove.com",
      role: "admin",
    })

    const disc = await ReconciliationDiscrepancy.create({
      fingerprint: "TEST-FP-REMEDIATION-1",
      runId: "RECON-TEST-1",
      category: "MISSING_INTERNAL_RECORD",
      providerReference: "REF-REMEDIATE-999",
      providerAmount: 75000,
      providerCurrency: "NGN",
      providerStatus: "success",
      explanation: "Missing internal record for Paystack reference REF-REMEDIATE-999",
      remediationStatus: "unresolved",
    })

    const remediated = await remediateDiscrepancy(
      disc._id.toString(),
      "RECONCILE_CREATE_TRANSACTION",
      reviewer._id.toString(),
      "Approved after verifying bank statement",
    )

    expect(remediated.remediationStatus).toBe("manually_resolved")
    expect(remediated.internalTransactionId).toBeDefined()
    expect(remediated.auditLogId).toBeDefined()

    const createdTx = await Transaction.findById(remediated.internalTransactionId)
    expect(createdTx).toBeDefined()
    expect(createdTx?.amount).toBe(75000)
    expect(createdTx?.gatewayReference).toBe("REF-REMEDIATE-999")

    const audit = await AuditLog.findById(remediated.auditLogId)
    expect(audit).toBeDefined()
    expect(audit?.action).toBe("RECONCILIATION_REMEDIATE")
  })
})
