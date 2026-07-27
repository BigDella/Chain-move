import { NextResponse } from "next/server"
import { processEmailJobs } from "@/lib/notifications/service"

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_WORKER_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await processEmailJobs())
}
