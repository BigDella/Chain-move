"use client"

import { isMockStellar } from "@/lib/mock-stellar/mockConfig"

export function DemoModeBanner() {
  if (!isMockStellar) return null

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-semibold shadow-sm w-full z-50">
      Demo Mode – Using Mock Stellar Data
    </div>
  )
}
