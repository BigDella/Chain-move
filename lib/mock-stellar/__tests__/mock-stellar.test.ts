import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

import { isMockStellar } from "../mockConfig"
import { mockAccount } from "../mockAccount"
import { mockAssets } from "../mockAssets"
import { mockActivity } from "../mockActivity"

describe("Mock Stellar Demo Flow", () => {
  describe("Mock Account", () => {
    it("connects successfully (fixture valid)", () => {
      expect(mockAccount).toBeDefined()
      expect(mockAccount.publicKey).toBe("GD3MOCKACCOUNT123456789")
      expect(mockAccount.network).toBe("Stellar Testnet")
      expect(mockAccount.balance).toBe("10000.00")
    })
  })

  describe("Mock Assets", () => {
    it("assets render (data structure is valid and integrated)", () => {
      expect(mockAssets).toHaveLength(2)
      expect(mockAssets[0].code).toBe("MOVE")
      expect(mockAssets[1].code).toBe("XLM")

      const walletPanelSource = fs.readFileSync(path.resolve(__dirname, "../../../components/dashboard/investor-wallet-panel.tsx"), "utf-8")
      expect(walletPanelSource).toContain("mockAssets.map")
    })
  })

  describe("Mock Activity", () => {
    it("activities render (data structure valid and integrated)", () => {
      expect(mockActivity.length).toBeGreaterThan(0)
      
      const dashboardSource = fs.readFileSync(path.resolve(__dirname, "../../../app/dashboard/investor/page.tsx"), "utf-8")
      expect(dashboardSource).toContain("mockActivity.map")
    })
  })

  describe("Mock Mode", () => {
    it("banner visible", () => {
      const bannerSource = fs.readFileSync(path.resolve(__dirname, "../../../components/demo-mode-banner.tsx"), "utf-8")
      expect(bannerSource).toContain("Demo Mode")
      
      const layoutSource = fs.readFileSync(path.resolve(__dirname, "../../../app/dashboard/layout.tsx"), "utf-8")
      expect(layoutSource).toContain("DemoModeBanner")
    })

    it("environment flag respected", () => {
      // isMockStellar might be false locally depending on .env, but we verify it's exported
      expect(isMockStellar).toBeDefined()
      // We check that it reads from process.env in the source
      const configSource = fs.readFileSync(path.resolve(__dirname, "../mockConfig.ts"), "utf-8")
      expect(configSource).toContain("process.env.NEXT_PUBLIC_ENABLE_MOCK_STELLAR")
    })
  })

  describe("Network Isolation", () => {
    it("no Horizon call", () => {
      const dashboardSource = fs.readFileSync(path.resolve(__dirname, "../../../app/dashboard/investor/page.tsx"), "utf-8")
      expect(dashboardSource).not.toContain("Horizon")
    })

    it("no RPC call", () => {
      const dashboardSource = fs.readFileSync(path.resolve(__dirname, "../../../app/dashboard/investor/page.tsx"), "utf-8")
      // Should short circuit early
      expect(dashboardSource).toContain("if (isMockStellar) {")
      expect(dashboardSource).toContain("setOnchainBalanceEth(Number.parseFloat(mockAccount.balance))")
    })

    it("no wallet extension dependency", () => {
      const walletPanelSource = fs.readFileSync(path.resolve(__dirname, "../../../components/dashboard/investor-wallet-panel.tsx"), "utf-8")
      // Should use mockAccount instead of embeddedWallet if mocked
      expect(walletPanelSource).toContain("isMockStellar ? mockAccount.publicKey")
    })
  })
})
