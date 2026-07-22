import { NextResponse } from "next/server"
import dbConnect from "@/lib/dbConnect"
import ReconciliationRun from "@/models/ReconciliationRun"
import { runReconciliation } from "@/lib/reconciliation/reconciliationEngine"
import { PaystackAdapter } from "@/lib/paystack/paystackAdapter"
import { MockPaystackAdapter } from "@/lib/paystack/mockAdapter"
import { generateReconciliationJsonSummary } from "@/lib/reconciliation/reporting"

export async function GET() {
  try {
    await dbConnect()
    const runs = await ReconciliationRun.find({}).sort({ startedAt: -1 }).limit(50).lean()
    return NextResponse.json({ success: true, runs })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch reconciliation runs" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect()
    const body = await request.json().catch(() => ({}))

    const { startDate, endDate, useMock = false, triggeredBy = "admin_api" } = body

    const now = new Date()
    const periodEnd = endDate ? new Date(endDate) : now
    const periodStart = startDate
      ? new Date(startDate)
      : new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)

    const adapter = useMock ? new MockPaystackAdapter() : new PaystackAdapter()
    const reconResult = await runReconciliation(periodStart, periodEnd, adapter, triggeredBy)

    const summary = generateReconciliationJsonSummary(
      reconResult.run.runId,
      periodStart,
      periodEnd,
      reconResult.discrepancies,
    )

    return NextResponse.json({ success: true, run: reconResult.run, summary }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to run reconciliation" },
      { status: 500 },
    )
  }
}
