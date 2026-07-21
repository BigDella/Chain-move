import { NextResponse } from "next/server"
import dbConnect from "@/lib/dbConnect"
import VehicleDocument from "@/models/VehicleDocument"
import { evaluateVehicleCompliance } from "@/lib/fleet/complianceService"

export async function GET(request: Request) {
  try {
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const vehicleId = searchParams.get("vehicleId")

    const filter = vehicleId ? { vehicleId } : {}
    const documents = await VehicleDocument.find(filter).sort({ expiryDate: 1 }).lean()

    return NextResponse.json({ success: true, documents })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch vehicle documents" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect()
    const body = await request.json()

    const {
      vehicleId,
      documentType,
      title,
      documentNumber,
      issuingAuthority,
      issueDate,
      expiryDate,
      fileUrl,
      notes,
    } = body

    if (!vehicleId || !documentType || !title || !issueDate || !expiryDate) {
      return NextResponse.json(
        { success: false, error: "vehicleId, documentType, title, issueDate, and expiryDate are required" },
        { status: 400 },
      )
    }

    const doc = await VehicleDocument.create({
      vehicleId,
      documentType,
      title,
      documentNumber,
      issuingAuthority,
      issueDate: new Date(issueDate),
      expiryDate: new Date(expiryDate),
      fileUrl,
      notes,
      verificationStatus: "verified",
    })

    // Re-evaluate vehicle compliance
    await evaluateVehicleCompliance(vehicleId)

    return NextResponse.json({ success: true, document: doc }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create vehicle document" },
      { status: 500 },
    )
  }
}
