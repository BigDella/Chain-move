import { NextResponse } from "next/server"

import { finalizeAuthenticatedResponse } from "@/lib/api/route-guard"
import { authorizeRequest } from "@/lib/authorization/route"
import dbConnect from "@/lib/dbConnect"
import User from "@/models/User"

export async function GET(request: Request) {
  try {
    await dbConnect()

    const authContext = await authorizeRequest(request, "kyc:review", { type: "kyc" })
    if ("response" in authContext) return authContext.response

    const kycRequests = await User.find({ role: { $in: ["driver", "investor"] } })
      .select(
        "role name fullName email phoneNumber kycStatus kycDocuments kycRejectionReason createdAt updatedAt physicalMeetingDate physicalMeetingStatus",
      )
      .sort({ updatedAt: -1 })

    const response = NextResponse.json(kycRequests, { status: 200 })
    return finalizeAuthenticatedResponse(response, authContext)
  } catch (error) {
    console.error("KYC_REQUESTS_GET_ERROR", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
