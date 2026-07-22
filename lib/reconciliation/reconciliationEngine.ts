import crypto from "crypto"
import dbConnect from "@/lib/dbConnect"
import ReconciliationRun, { IReconciliationRun } from "@/models/ReconciliationRun"
import ReconciliationDiscrepancy, {
  DiscrepancyCategory,
  IReconciliationDiscrepancy,
  RemediationStatus,
} from "@/models/ReconciliationDiscrepancy"
import ProcessedGatewayEvent from "@/models/ProcessedGatewayEvent"
import Transaction from "@/models/Transaction"
import DriverPayment from "@/models/DriverPayment"
import DriverVirtualAccount from "@/models/DriverVirtualAccount"
import InvestorVirtualAccount from "@/models/InvestorVirtualAccount"
import User from "@/models/User"
import AuditLog from "@/models/AuditLog"
import { IPaystackAdapter, PaystackTransactionRecord } from "@/lib/paystack/types"

/**
 * Computes deterministic SHA-256 hash fingerprint for discrepancy deduplication across re-runs.
 */
export function createDiscrepancyFingerprint(
  category: DiscrepancyCategory,
  providerRef = "",
  internalTxId = "",
  amount = 0,
): string {
  const raw = `${category}:${providerRef}:${internalTxId}:${amount}`
  return crypto.createHash("sha256").update(raw).digest("hex")
}

export interface ReconciliationRunResult {
  run: IReconciliationRun
  discrepancies: IReconciliationDiscrepancy[]
}

/**
 * Executes Paystack-to-ledger settlement reconciliation over specified date window.
 */
export async function runReconciliation(
  periodStart: Date,
  periodEnd: Date,
  adapter: IPaystackAdapter,
  triggeredBy = "system",
): Promise<ReconciliationRunResult> {
  await dbConnect()

  const runId = `RECON-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  const runDoc = await ReconciliationRun.create({
    runId,
    provider: "paystack",
    periodStart,
    periodEnd,
    status: "in_progress",
    triggeredBy,
    startedAt: new Date(),
  })

  try {
    // 1. Fetch provider transaction records with pagination
    let page = 1
    const perPage = 50
    let allProviderRecords: PaystackTransactionRecord[] = []
    let hasMore = true

    while (hasMore) {
      const resp = await adapter.fetchTransactions({
        from: periodStart.toISOString(),
        to: periodEnd.toISOString(),
        page,
        perPage,
      })

      allProviderRecords = allProviderRecords.concat(resp.data || [])
      if (!resp.meta || page >= resp.meta.pageCount) {
        hasMore = false
      } else {
        page++
      }
    }

    // 2. Fetch internal records within date window
    const internalTxs = await Transaction.find({
      timestamp: { $gte: periodStart, $lte: periodEnd },
    }).lean()

    const processedEvents = await ProcessedGatewayEvent.find({
      createdAt: { $gte: periodStart, $lte: periodEnd },
    }).lean()

    const driverPayments = await DriverPayment.find({
      paymentDate: { $gte: periodStart, $lte: periodEnd },
    }).lean()

    const driverDvas = await DriverVirtualAccount.find({}).lean()
    const investorDvas = await InvestorVirtualAccount.find({}).lean()
    const users = await User.find({}).lean()

    // Fast lookup maps
    const internalByRef = new Map<string, any>()
    for (const tx of internalTxs) {
      if (tx.gatewayReference) {
        internalByRef.set(tx.gatewayReference, tx)
      }
    }

    const processedEventIds = new Set<string>(processedEvents.map((e) => e._id))
    const driverPaymentByRef = new Map<string, any>()
    for (const dp of driverPayments) {
      if (dp.gatewayReference) {
        driverPaymentByRef.set(dp.gatewayReference, dp)
      }
    }

    const providerRefCounts = new Map<string, number>()
    for (const pRec of allProviderRecords) {
      if (pRec.reference) {
        providerRefCounts.set(pRec.reference, (providerRefCounts.get(pRec.reference) || 0) + 1)
      }
    }

    const discrepanciesToSave: Array<Partial<IReconciliationDiscrepancy>> = []
    let matchedCount = 0

    // 3. Compare Provider Records -> Internal Records
    for (const pRec of allProviderRecords) {
      const pRef = pRec.reference
      const pAmountNgn = pRec.amount / 100 // Convert kobo to NGN
      const pStatus = pRec.status

      // Check DUPLICATE_PROVIDER_RECORD
      if (providerRefCounts.get(pRef)! > 1) {
        const fp = createDiscrepancyFingerprint("DUPLICATE_PROVIDER_RECORD", pRef, "", pAmountNgn)
        discrepanciesToSave.push({
          fingerprint: fp,
          runId,
          category: "DUPLICATE_PROVIDER_RECORD",
          providerReference: pRef,
          providerAmount: pAmountNgn,
          providerCurrency: pRec.currency,
          providerStatus: pStatus,
          providerCustomerEmail: pRec.customer?.email,
          explanation: `Paystack reported duplicate reference '${pRef}' across multiple transaction entries`,
        })
      }

      // Check UNKNOWN_ACCOUNT if dedicated account transfer
      const dvaNumber = pRec.dedicated_account?.account_number
      if (dvaNumber) {
        const foundDriverDva = driverDvas.find((d) => d.accountNumber === dvaNumber)
        const foundInvestorDva = investorDvas.find((i) => i.accountNumber === dvaNumber)
        if (!foundDriverDva && !foundInvestorDva) {
          const fp = createDiscrepancyFingerprint("UNKNOWN_ACCOUNT", pRef, "", pAmountNgn)
          discrepanciesToSave.push({
            fingerprint: fp,
            runId,
            category: "UNKNOWN_ACCOUNT",
            providerReference: pRef,
            providerAmount: pAmountNgn,
            providerDedicatedAccount: dvaNumber,
            providerCustomerEmail: pRec.customer?.email,
            explanation: `Dedicated account transfer to '${dvaNumber}' does not match any registered driver or investor virtual account`,
          })
        }
      }

      const matchingTx = internalByRef.get(pRef)
      const matchingDp = driverPaymentByRef.get(pRef)
      const matchingEventId = processedEventIds.has(pRef)

      if (!matchingTx && !matchingDp && !matchingEventId) {
        // MISSING_INTERNAL_RECORD
        const fp = createDiscrepancyFingerprint("MISSING_INTERNAL_RECORD", pRef, "", pAmountNgn)
        discrepanciesToSave.push({
          fingerprint: fp,
          runId,
          category: "MISSING_INTERNAL_RECORD",
          providerReference: pRef,
          providerAmount: pAmountNgn,
          providerCurrency: pRec.currency,
          providerStatus: pStatus,
          providerCustomerEmail: pRec.customer?.email,
          explanation: `Provider transaction '${pRef}' of NGN ${pAmountNgn} has no corresponding internal Transaction or DriverPayment record`,
        })
      } else {
        matchedCount++

        const intTx = matchingTx || matchingDp
        const intAmount = intTx ? intTx.amount || intTx.amountPaidNgn : 0
        const intStatus = intTx ? intTx.status : "Completed"

        // Check AMOUNT_MISMATCH
        if (intTx && Math.abs(intAmount - pAmountNgn) > 0.01) {
          const intId = intTx._id.toString()
          const fp = createDiscrepancyFingerprint("AMOUNT_MISMATCH", pRef, intId, pAmountNgn)
          discrepanciesToSave.push({
            fingerprint: fp,
            runId,
            category: "AMOUNT_MISMATCH",
            providerReference: pRef,
            providerAmount: pAmountNgn,
            internalTransactionId: intId,
            internalAmount: intAmount,
            explanation: `Paystack settled amount (NGN ${pAmountNgn}) does not match internal record amount (NGN ${intAmount})`,
          })
        }

        // Check STATUS_MISMATCH
        const pSuccess = pStatus === "success"
        const intSuccess = intStatus === "Completed"
        if (intTx && pSuccess !== intSuccess) {
          const intId = intTx._id.toString()
          const fp = createDiscrepancyFingerprint("STATUS_MISMATCH", pRef, intId, pAmountNgn)
          discrepanciesToSave.push({
            fingerprint: fp,
            runId,
            category: "STATUS_MISMATCH",
            providerReference: pRef,
            providerAmount: pAmountNgn,
            providerStatus: pStatus,
            internalTransactionId: intId,
            internalStatus: intStatus,
            explanation: `Paystack status is '${pStatus}' but internal transaction status is '${intStatus}'`,
          })
        }

        // Check REVERSAL_REFUND
        if (pStatus === "reversed" && intSuccess) {
          const intId = intTx._id.toString()
          const fp = createDiscrepancyFingerprint("REVERSAL_REFUND", pRef, intId, pAmountNgn)
          discrepanciesToSave.push({
            fingerprint: fp,
            runId,
            category: "REVERSAL_REFUND",
            providerReference: pRef,
            providerAmount: pAmountNgn,
            providerStatus: pStatus,
            internalTransactionId: intId,
            internalStatus: intStatus,
            explanation: `Paystack transaction '${pRef}' was reversed/refunded after internal transaction was completed`,
          })
        }

        // Check OWNER_MISMATCH if customer email differs from internal user
        if (pRec.customer?.email && intTx && intTx.userId) {
          const userObj = users.find((u) => u._id.toString() === intTx.userId.toString())
          if (userObj && userObj.email && userObj.email.toLowerCase() !== pRec.customer.email.toLowerCase()) {
            const intId = intTx._id.toString()
            const fp = createDiscrepancyFingerprint("OWNER_MISMATCH", pRef, intId, pAmountNgn)
            discrepanciesToSave.push({
              fingerprint: fp,
              runId,
              category: "OWNER_MISMATCH",
              providerReference: pRef,
              providerAmount: pAmountNgn,
              providerCustomerEmail: pRec.customer.email,
              internalTransactionId: intId,
              explanation: `Paystack customer email '${pRec.customer.email}' does not match internal record user email '${userObj.email}'`,
            })
          }
        }
      }
    }

    // 4. Compare Internal Records -> Provider Records
    const providerRefMap = new Map<string, PaystackTransactionRecord>()
    for (const pRec of allProviderRecords) {
      if (pRec.reference) {
        providerRefMap.set(pRec.reference, pRec)
      }
    }

    const now = new Date().getTime()
    for (const tx of internalTxs) {
      const gRef = tx.gatewayReference
      if (gRef && !providerRefMap.has(gRef)) {
        // MISSING_PROVIDER_RECORD
        const txId = tx._id.toString()
        const fp = createDiscrepancyFingerprint("MISSING_PROVIDER_RECORD", gRef, txId, tx.amount)
        discrepanciesToSave.push({
          fingerprint: fp,
          runId,
          category: "MISSING_PROVIDER_RECORD",
          providerReference: gRef,
          internalTransactionId: txId,
          internalAmount: tx.amount,
          internalStatus: tx.status,
          explanation: `Internal transaction '${txId}' has gateway reference '${gRef}' but Paystack returned no matching transaction record`,
        })
      }

      // Check STALE_PENDING (>24 hours in Pending status)
      if (tx.status === "Pending") {
        const ageHours = (now - new Date(tx.timestamp).getTime()) / (1000 * 60 * 60)
        if (ageHours > 24) {
          const txId = tx._id.toString()
          const fp = createDiscrepancyFingerprint("STALE_PENDING", gRef || "", txId, tx.amount)
          discrepanciesToSave.push({
            fingerprint: fp,
            runId,
            category: "STALE_PENDING",
            providerReference: gRef,
            internalTransactionId: txId,
            internalAmount: tx.amount,
            internalStatus: tx.status,
            explanation: `Internal transaction '${txId}' has been in 'Pending' status for ${Math.round(ageHours)} hours`,
          })
        }
      }
    }

    // 5. Idempotently save discrepancies using fingerprint deduplication
    const savedDiscrepancies: IReconciliationDiscrepancy[] = []
    for (const disc of discrepanciesToSave) {
      const upserted = await ReconciliationDiscrepancy.findOneAndUpdate(
        { fingerprint: disc.fingerprint },
        { $setOnInsert: { ...disc, remediationStatus: "unresolved" } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      savedDiscrepancies.push(upserted)
    }

    // 6. Update Reconciliation Run document metrics
    runDoc.status = "completed"
    runDoc.completedAt = new Date()
    runDoc.metrics = {
      totalProviderRecords: allProviderRecords.length,
      totalInternalRecords: internalTxs.length,
      matchedRecords: matchedCount,
      discrepancyCount: savedDiscrepancies.length,
      remediatedCount: 0,
    }
    await runDoc.save()

    return { run: runDoc, discrepancies: savedDiscrepancies }
  } catch (error: any) {
    runDoc.status = "failed"
    runDoc.completedAt = new Date()
    runDoc.errorMessage = error.message || "Reconciliation run failed"
    await runDoc.save()
    throw error
  }
}

/**
 * Safely remediates a discrepancy with elevated authorization and immutable counter-adjustment audit history.
 */
export async function remediateDiscrepancy(
  discrepancyId: string,
  action: "RECONCILE_CREATE_TRANSACTION" | "RECONCILE_POST_REVERSAL" | "RECONCILE_UPDATE_STATUS" | "IGNORE",
  reviewerUserId: string,
  notes: string,
): Promise<IReconciliationDiscrepancy> {
  await dbConnect()

  const discrepancy = await ReconciliationDiscrepancy.findById(discrepancyId)
  if (!discrepancy) {
    throw new Error(`Reconciliation discrepancy ${discrepancyId} not found`)
  }

  if (discrepancy.remediationStatus !== "unresolved") {
    throw new Error(`Discrepancy ${discrepancyId} is already resolved (${discrepancy.remediationStatus})`)
  }

  let auditAction = ""

  if (action === "RECONCILE_CREATE_TRANSACTION") {
    // Create missing internal transaction record safely
    if (discrepancy.category === "MISSING_INTERNAL_RECORD") {
      const systemUser = await User.findOne({ role: "admin" })
      const userId = systemUser ? systemUser._id : reviewerUserId

      const newTx = await Transaction.create({
        userId,
        userType: "admin",
        type: "wallet_funding",
        amount: discrepancy.providerAmount || 0,
        currency: discrepancy.providerCurrency || "NGN",
        method: "paystack",
        gatewayReference: discrepancy.providerReference,
        description: `Reconciliation correction for missing Paystack reference ${discrepancy.providerReference}`,
        status: "Completed",
        timestamp: new Date(),
      })

      discrepancy.internalTransactionId = newTx._id.toString()
      auditAction = `RECONCILE_CREATE_TRANSACTION: Created transaction ${newTx._id}`
    }
  } else if (action === "RECONCILE_POST_REVERSAL") {
    // Post immutable counter-adjustment wallet_debit transaction
    if (discrepancy.internalTransactionId) {
      const origTx = await Transaction.findById(discrepancy.internalTransactionId)
      if (origTx) {
        const revTx = await Transaction.create({
          userId: origTx.userId,
          userType: origTx.userType,
          type: "wallet_debit",
          amount: discrepancy.providerAmount || origTx.amount,
          currency: origTx.currency || "NGN",
          method: "system",
          gatewayReference: `REV-${discrepancy.providerReference || origTx.gatewayReference}`,
          description: `Reconciliation reversal counter-adjustment for ${discrepancy.providerReference || origTx._id}`,
          status: "Completed",
          relatedId: origTx._id.toString(),
          timestamp: new Date(),
        })

        auditAction = `RECONCILE_POST_REVERSAL: Posted counter-debit transaction ${revTx._id}`
      }
    }
  } else if (action === "RECONCILE_UPDATE_STATUS") {
    if (discrepancy.internalTransactionId) {
      const tx = await Transaction.findById(discrepancy.internalTransactionId)
      if (tx) {
        tx.status = discrepancy.providerStatus === "success" ? "Completed" : "Failed"
        await tx.save()
        auditAction = `RECONCILE_UPDATE_STATUS: Updated transaction ${tx._id} status to ${tx.status}`
      }
    }
  } else if (action === "IGNORE") {
    auditAction = "IGNORE: Marked discrepancy as ignored by reviewer"
  }

  // Create Audit Log record
  const auditEntry = await AuditLog.create({
    userId: reviewerUserId,
    action: "RECONCILIATION_REMEDIATE",
    targetModel: "ReconciliationDiscrepancy",
    targetId: discrepancy._id,
    details: {
      action,
      category: discrepancy.category,
      providerReference: discrepancy.providerReference,
      notes,
      auditAction,
    },
    timestamp: new Date(),
  })

  discrepancy.remediationStatus = action === "IGNORE" ? "ignored" : "manually_resolved"
  discrepancy.resolutionNotes = notes
  discrepancy.resolvedByUserId = reviewerUserId as any
  discrepancy.resolvedAt = new Date()
  discrepancy.resolutionAction = auditAction
  discrepancy.auditLogId = auditEntry._id as any

  await discrepancy.save()
  return discrepancy
}
