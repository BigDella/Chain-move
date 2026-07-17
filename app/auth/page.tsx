"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, ArrowRight, Car, Loader2, Phone, TrendingUp, User } from "lucide-react"

import { AuthInput } from "@/components/auth/AuthInput"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { resolvePrivyAccessToken } from "@/lib/auth/privy-client"
import { useIdentityToken, usePrivy } from "@/lib/privy/react-auth"
import { validatePhoneNumberInput } from "@/lib/validation/phone"

type UserRole = "driver" | "investor"

const SIGNUP_DRAFT_KEY = "chainmove_signup_draft"

type SignupDraft = {
  fullName: string
  phoneNumber: string
  role: UserRole
}

function safeReadSignupDraft() {
  if (typeof window === "undefined") return null as SignupDraft | null

  try {
    const raw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fullName?: string; phoneNumber?: string; role?: UserRole }
    if (!parsed.fullName || !parsed.phoneNumber || !parsed.role) return null
    return { fullName: parsed.fullName, phoneNumber: parsed.phoneNumber, role: parsed.role }
  } catch {
    return null
  }
}

function saveSignupDraft(draft: SignupDraft) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft))
}

function clearSignupDraft() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY)
}

export default function AuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { login, ready, authenticated, getAccessToken } = usePrivy()
  const { identityToken } = useIdentityToken()

  const roleParam = searchParams.get("role")
  const [selectedRole, setSelectedRole] = useState<UserRole>(() => {
    const savedDraft = safeReadSignupDraft()
    if (roleParam === "driver") return "driver"
    if (savedDraft?.role) return savedDraft.role
    return "investor"
  })
  const roleLabel = useMemo(() => (selectedRole === "driver" ? "Driver" : "Investor"), [selectedRole])
  const RoleIcon = selectedRole === "driver" ? Car : TrendingUp

  const [fullName, setFullName] = useState(() => safeReadSignupDraft()?.fullName || "")
  const [phoneNumber, setPhoneNumber] = useState(() => safeReadSignupDraft()?.phoneNumber || "")
  const [formError, setFormError] = useState("")
  const [isLaunchingPrivy, setIsLaunchingPrivy] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const isSyncInFlightRef = useRef(false)

  const syncPrivyUser = useCallback(
    async (payload: { fullName?: string; phoneNumber?: string; role?: UserRole }) => {
      if (isSyncInFlightRef.current) return
      isSyncInFlightRef.current = true
      setIsSyncing(true)
      setFormError("")

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
          body: JSON.stringify(payload),
        })

        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.message || "Unable to sync account.")
        }

        clearSignupDraft()
        toast({
          title: "Account ready",
          description: "Your ChainMove account was created successfully.",
        })

        const role = result.user?.role || payload.role || "investor"
        router.replace(`/dashboard/${role}`)
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Unable to complete sign up.")
      } finally {
        setIsSyncing(false)
        setIsLaunchingPrivy(false)
        isSyncInFlightRef.current = false
      }
    },
    [getAccessToken, identityToken, router, toast],
  )

  const handleStartSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError("")

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setFormError("Full name is required.")
      return
    }

    const phoneValidation = validatePhoneNumberInput(phoneNumber, { required: true })
    if (phoneValidation.error || !phoneValidation.value) {
      setFormError(phoneValidation.error || "Phone number is required.")
      return
    }

    const draft = { fullName: trimmedName, phoneNumber: phoneValidation.value, role: selectedRole }
    saveSignupDraft(draft)

    if (ready && authenticated) {
      void syncPrivyUser(draft)
      return
    }

    setIsLaunchingPrivy(true)
    try {
      login({
        loginMethods: ["email", "sms"],
      })
    } catch (error) {
      setIsLaunchingPrivy(false)
      setFormError("Unable to open Privy authentication. Please try again.")
    }
  }

  useEffect(() => {
    if (roleParam === "driver" || roleParam === "investor") {
      setSelectedRole(roleParam)
      return
    }

    const savedDraft = safeReadSignupDraft()
    if (savedDraft?.role) {
      setSelectedRole(savedDraft.role)
    }
  }, [roleParam])

  useEffect(() => {
    if (!ready || !authenticated) return

    const draft = safeReadSignupDraft()
    if (!draft) return

    void syncPrivyUser(draft)
  }, [authenticated, ready, syncPrivyUser])

  return (
    <AuthLayout
      title="Create your ChainMove account"
      description="Start with your full name and contact phone number, then complete secure signup with Privy."
      badge={`${roleLabel} sign up`}
      sideTitle="Built for drivers, investors, and operators"
      sideDescription="ChainMove connects real mobility assets to transparent financing and ownership tracking."
      sidePoints={[
        "Fractional mobility ownership with transparent records",
        "Wallet-first funding and investment experience",
        "Fast onboarding with embedded Privy wallets",
      ]}
      footer={
        <p className="text-sm text-[#666666]">
          Already have an account?{" "}
          <Link
            href={`/signin?role=${selectedRole}`}
            className="font-medium text-[#F2780E] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2780E]"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <div className="mb-4 space-y-3">
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
            Signing up as {roleLabel}
          </p>
        </div>
      </div>

      <form onSubmit={handleStartSignup} noValidate className="space-y-4">
        <AuthInput
          id="full-name"
          label="Full name"
          icon={User}
          type="text"
          autoComplete="name"
          placeholder="Enter your full name"
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            if (formError) setFormError("")
          }}
        />

        <AuthInput
          id="phone-number"
          label="Contact phone number"
          icon={Phone}
          type="tel"
          autoComplete="tel"
          placeholder="+234 801 234 5678"
          value={phoneNumber}
          onChange={(event) => {
            setPhoneNumber(event.target.value)
            if (formError) setFormError("")
          }}
        />

        {formError ? (
          <div
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formError}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={isLaunchingPrivy || isSyncing}
          className="h-12 w-full rounded-xl bg-[#F2780E] text-white hover:bg-[#DF6D0A] focus-visible:ring-[#F2780E]"
        >
          {isLaunchingPrivy || isSyncing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isSyncing ? "Finalizing account..." : "Opening Privy..."}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              Continue with Privy
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
