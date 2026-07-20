import { NextResponse } from "next/server"
import { z } from "zod"

import { finalizeAuthenticatedResponse } from "@/lib/api/route-guard"
import { authorizeRequest } from "@/lib/authorization/route"
import { parseSearchParams } from "@/lib/api/validation"
import dbConnect from "@/lib/dbConnect"
import Investment from "@/models/Investment"

const querySchema = z.object({
  investorId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid investorId.").optional(),
})

export async function GET(request: Request) {
  try {
    const query = parseSearchParams(request, querySchema)
    if ("response" in query) return query.response

    await dbConnect()

    const authContext = await authorizeRequest(request, "investment:read", user => Promise.resolve({
      type: "investment",
      ownerId: user.role === "admin" && query.data.investorId ? query.data.investorId : user._id.toString(),
    }))
    if ("response" in authContext) return authContext.response

    const investorId = authContext.user.role === "admin" && query.data.investorId ? query.data.investorId : authContext.user._id.toString()

    const filter = authContext.user.role === "admin" && !query.data.investorId ? {} : { investorId }

    const investments = await Investment.find(filter).sort({ startDate: -1, date: -1 })

    const response = NextResponse.json({
      success: true,
      investments,
    })

    return finalizeAuthenticatedResponse(response, authContext)
  } catch (error) {
    console.error("INVESTMENTS_GET_ERROR", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
