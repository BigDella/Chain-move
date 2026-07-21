import { NextResponse } from "next/server"
import { applyRepair, previewRepair } from "@/lib/integrity/repairEngine"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { findingId, action = "preview", actor = "admin_api" } = body

    if (!findingId) {
      return NextResponse.json({ success: false, error: "findingId is required" }, { status: 400 })
    }

    if (action === "preview") {
      const preview = await previewRepair(findingId)
      return NextResponse.json({ success: true, action: "preview", preview })
    }

    if (action === "apply") {
      const result = await applyRepair(findingId, actor)
      return NextResponse.json({ success: result.success, action: "apply", result })
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Expected 'preview' or 'apply'" },
      { status: 400 },
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process repair" },
      { status: 500 },
    )
  }
}
