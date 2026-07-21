import { NextResponse } from "next/server"
import dbConnect from "@/lib/dbConnect"
import { remediateDiscrepancy } from "@/lib/reconciliation/reconciliationEngine"

export async function POST(request: Request) {
  try {
    await dbConnect()
    const body = await request.json()
    const { discrepancyId, action, reviewerUserId, notes } = body

    if (!discrepancyId || !action || !reviewerUserId) {
      return NextResponse.json(
        { success: false, error: "discrepancyId, action, and reviewerUserId are required" },
        { status: 400 },
      )
    }

    const updated = await remediateDiscrepancy(
      discrepancyId,
      action,
      reviewerUserId,
      notes || "Admin API Remediation Trigger",
    )

    return NextResponse.json({ success: true, discrepancy: updated })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to remediate discrepancy" },
      { status: 500 },
    )
  }
}
