import { NextResponse } from "next/server"
import dbConnect from "@/lib/dbConnect"
import ReconciliationDiscrepancy from "@/models/ReconciliationDiscrepancy"
import { redactPii } from "@/lib/reconciliation/reporting"

export async function GET(request: Request) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get("runId")
    const category = searchParams.get("category")
    const status = searchParams.get("remediationStatus")

    const query: Record<string, any> = {}
    if (runId) query.runId = runId
    if (category) query.category = category
    if (status) query.remediationStatus = status

    const discrepancies = await ReconciliationDiscrepancy.find(query)
      .sort({ createdAt: -1 })
      .lean()

    const sanitized = redactPii(discrepancies)

    return NextResponse.json({ success: true, count: sanitized.length, discrepancies: sanitized })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discrepancies" },
      { status: 500 },
    )
  }
}
