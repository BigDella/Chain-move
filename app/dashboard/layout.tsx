import type { ReactNode } from "react"

import { MotionProvider } from "@/components/motion/motion-provider"
import { Providers } from "@/app/Providers"
import { DemoModeBanner } from "@/components/demo-mode-banner"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <MotionProvider>
        <DemoModeBanner />
        {children}
      </MotionProvider>
    </Providers>
  )
}
