"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, ArrowRight, Car, Loader2, TrendingUp } from "lucide-react"

import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { resolvePrivyAccessToken } from "@/lib/auth/privy-client"
import { useIdentityToken, usePrivy } from "@/lib/privy/react-auth"

type UserRole = "driver" | "investor"

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { login, ready, authenticated, getAccessToken } = usePrivy()
  const { identityToken } = useIdentityToken()

  const roleParam = searchParams.get("role")
  const [selectedRole, setSelectedRole] = useState<UserRole>(roleParam === "driver" ? "driver" : "investor")
  const roleLabel = useMemo(() => (selectedRole === "driver" ? "Driver" : "Investor"), [selectedRole])
  const RoleIcon = selectedRole === "driver" ? Car : TrendingUp

  const [isLaunchingPrivy, setIsLaunchingPrivy] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState("")
  const syncInFlightRef = useRef(false)

  const syncUser = useCallback(async () => {
    if (syncInFlightRef.current) return
    syncInFlightRef.current = true
    setIsSyncing(true)
    setError("")

    try {
      const privyToken = await resolvePrivyAccessToken(getAccessToken, identityToken)
      if (!privyToken) {
        throw new Error("Unable to retrieve your Privy token. Please try again.")
      }

      const response = await fetch("/api/auth/privy/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${privyToken}`,
        },
        body: JSON.stringify({ role: selectedRole }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || "Unable to sign in.")
      }

      toast({
        title: "Signed in",
        description: `Welcome back, ${result.user?.name || "User"}.`,
      })

      const role = result.user?.role || selectedRole || "investor"
      router.replace(`/dashboard/${role}`)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sign in.")
    } finally {
      setIsSyncing(false)
      setIsLaunchingPrivy(false)
      syncInFlightRef.current = false
    }
  }, [getAccessToken, identityToken, router, selectedRole, toast])

  const handlePrivySignIn = () => {
    setError("")
    setIsLaunchingPrivy(true)
    try {
      login({
        loginMethods: ["email", "sms"],
      })
    } catch {
      setIsLaunchingPrivy(false)
      setError("Unable to open Privy authentication. Please try again.")
    }
  }

  useEffect(() => {
    setSelectedRole(roleParam === "driver" ? "driver" : "investor")
  }, [roleParam])

  useEffect(() => {
    if (!ready || !authenticated) return
    void syncUser()
  }, [authenticated, ready, syncUser])

  return (
    <AuthLayout
      title="Sign in to ChainMove"
      description="Continue securely with Privy to access your dashboard."
      sideTitle="Wallet-first authentication"
      sideDescription="Sign in once with Privy and continue with your embedded wallet and account session."
      sidePoints={[
        "No wallet extension required",
        "Embedded wallet auto-provisioning",
        "Unified account access across dashboard flows",
      ]}
      footer={
        <p className="text-sm text-[#666666]">
          New to ChainMove?{" "}
          <Link
            href={`/auth?role=${selectedRole}`}
            className="font-medium text-[#F2780E] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2780E]"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#403325]">Choose account type</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedRole("driver")}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                selectedRole === "driver"
                  ? "border-[#F2780E] bg-[#FFF1E6] text-[#8A4B19]"
                  : "border-[#E5E7EB] bg-white text-[#5C5C5C] hover:border-[#F4D4BC]"
              }`}
            >
              Driver
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole("investor")}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                selectedRole === "investor"
                  ? "border-[#F2780E] bg-[#FFF1E6] text-[#8A4B19]"
                  : "border-[#E5E7EB] bg-white text-[#5C5C5C] hover:border-[#F4D4BC]"
              }`}
            >
              Investor
            </button>
          </div>
          <div className="rounded-xl border border-[#F4D4BC] bg-[#FFF6EE] px-3 py-2 text-sm text-[#8A4B19]">
            <p className="inline-flex items-center gap-2 font-medium">
              <RoleIcon className="h-4 w-4" />
              Signing in as {roleLabel}
            </p>
          </div>
        </div>

        <p className="text-sm leading-6 text-[#666666]">
          Continue with your verified email or phone through Privy. Your wallet and session will be restored
          automatically.
        </p>

        {error ? (
          <div
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <Button
          type="button"
          onClick={handlePrivySignIn}
          disabled={isLaunchingPrivy || isSyncing}
          className="h-12 w-full rounded-xl bg-[#F2780E] text-white hover:bg-[#DF6D0A] focus-visible:ring-[#F2780E]"
        >
          {isLaunchingPrivy || isSyncing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isSyncing ? "Signing you in..." : "Opening Privy..."}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              Continue with Privy
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </div>
    </AuthLayout>
  )
}
