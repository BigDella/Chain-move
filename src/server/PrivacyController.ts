import dbConnect from "@/lib/dbConnect"
import { logAuditEvent } from "@/lib/security/audit-log"
import PrivacyRequest from "@/models/PrivacyRequest"
import HirePurchaseContract from "@/models/HirePurchaseContract"
import DriverVirtualAccount from "@/models/DriverVirtualAccount"
import InvestorVirtualAccount from "@/models/InvestorVirtualAccount"
import User from "@/models/User"

export interface UserExportData {
  id: string
  name: string | null
  email: string | null
  phoneNumber: string | null
  role: string
  kycStatus: string
  kycVerified: boolean
  availableBalance: number
  totalInvested: number
  totalReturns: number
  stellarPublicKey: string | null
  createdAt: Date
  updatedAt: Date
}

function generateAnonymousValue(fieldName: string, userId: string): string {
  const hash = `${userId}-${fieldName}`.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return `REDACTED_${fieldName.toUpperCase()}_${hash}`
}

export async function executeDataExport(userId: string): Promise<UserExportData> {
  const user = await User.findById(userId)
    .select(
      "name email phoneNumber role kycStatus kycVerified availableBalance totalInvested totalReturns stellarPublicKey createdAt updatedAt",
    )
    .lean()

  if (!user) {
    throw new Error(`User not found for export: ${userId}`)
  }

  return {
    id: user._id?.toString() || userId,
    name: user.name || null,
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    role: user.role || "unknown",
    kycStatus: user.kycStatus || "none",
    kycVerified: Boolean(user.kycVerified),
    availableBalance: user.availableBalance || 0,
    totalInvested: user.totalInvested || 0,
    totalReturns: user.totalReturns || 0,
    stellarPublicKey: user.stellarPublicKey || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function executeAccountAnonymization(userId: string): Promise<void> {
  const user = await User.findById(userId)

  if (!user) {
    throw new Error(`User not found for anonymization: ${userId}`)
  }

  user.name = generateAnonymousValue("name", userId)
  user.fullName = generateAnonymousValue("fullname", userId)
  user.email = generateAnonymousValue("email", userId)
  user.phoneNumber = generateAnonymousValue("phone", userId)
  user.bio = null
  user.address = null
  user.walletaddress = null
  user.walletAddress = null
  user.privyUserId = null
  user.stellarPublicKey = null
  user.kycDocuments = []
  user.kycRejectionReason = null
  user.notifications = []

  await user.save()

  await logAuditEvent({
    actor: null,
    action: "ACCOUNT_ANONYMIZED",
    targetType: "User",
    targetId: userId,
    status: "success",
    metadata: {
      anonymizedAt: new Date(),
    },
  })
}

export async function processPrivacyRequest(requestId: string): Promise<void> {
  await dbConnect()

  const privacyRequest =
    (await PrivacyRequest.findOne({ id: requestId }).exec()) ??
    (await PrivacyRequest.findById(requestId).exec())

  if (!privacyRequest) {
    throw new Error(`PrivacyRequest not found: ${requestId}`)
  }

  if (privacyRequest.requestType !== "CLOSURE") {
    return
  }

  try {
    const [user, activeContract, activeDriverAccounts, activeInvestorAccounts] =
      await Promise.all([
        User.findById(privacyRequest.userId)
          .select("availableBalance totalInvested totalReturns")
          .lean(),
        HirePurchaseContract.findOne({
          driverUserId: privacyRequest.userId,
          status: "ACTIVE",
        }).lean(),
        DriverVirtualAccount.find({
          driverUserId: privacyRequest.userId,
          status: "ACTIVE",
        }).lean(),
        InvestorVirtualAccount.find({
          investorUserId: privacyRequest.userId,
          status: "ACTIVE",
        }).lean(),
      ])

    const balanceIssues: string[] = []
    if (!user) {
      balanceIssues.push("user record missing")
    } else {
      if (
        (typeof user.availableBalance === "number" && user.availableBalance > 0) ||
        (typeof user.totalInvested === "number" && user.totalInvested > 0) ||
        (typeof user.totalReturns === "number" && user.totalReturns > 0)
      ) {
        balanceIssues.push("non-zero user balances")
      }
    }

    const hasActiveVirtualAccounts =
      activeDriverAccounts.length > 0 || activeInvestorAccounts.length > 0
    const hasActiveContracts = Boolean(activeContract)

    if (hasActiveContracts || hasActiveVirtualAccounts || balanceIssues.length > 0) {
      privacyRequest.status = "FAILED"
      privacyRequest.retryCount = (privacyRequest.retryCount || 0) + 1
      await privacyRequest.save()

      await logAuditEvent({
        actor: { _id: privacyRequest.userId },
        action: "PRIVACY_REQUEST_CLOSURE_COMPLIANCE_VIOLATION",
        targetType: "PrivacyRequest",
        targetId: privacyRequest.id || privacyRequest._id?.toString(),
        status: "failure",
        metadata: {
          userId: privacyRequest.userId,
          activeContract: hasActiveContracts,
          activeDriverAccounts: activeDriverAccounts.length,
          activeInvestorAccounts: activeInvestorAccounts.length,
          balanceIssues,
          userBalances: {
            availableBalance: user?.availableBalance,
            totalInvested: user?.totalInvested,
            totalReturns: user?.totalReturns,
          },
        },
      })

      return
    }

    if (privacyRequest.requestType === "EXPORT") {
      const exportData = await executeDataExport(privacyRequest.userId.toString())

      privacyRequest.status = "COMPLETED"
      await privacyRequest.save()

      await logAuditEvent({
        actor: { _id: privacyRequest.userId },
        action: "PRIVACY_REQUEST_EXPORT_COMPLETED",
        targetType: "PrivacyRequest",
        targetId: privacyRequest.id || privacyRequest._id?.toString(),
        status: "success",
        metadata: {
          userId: privacyRequest.userId,
          exportedFields: Object.keys(exportData),
        },
      })

      return
    }

    if (privacyRequest.requestType === "CLOSURE") {
      await executeAccountAnonymization(privacyRequest.userId.toString())

      privacyRequest.status = "COMPLETED"
      await privacyRequest.save()

      await logAuditEvent({
        actor: { _id: privacyRequest.userId },
        action: "PRIVACY_REQUEST_CLOSURE_COMPLETED",
        targetType: "PrivacyRequest",
        targetId: privacyRequest.id || privacyRequest._id?.toString(),
        status: "success",
        metadata: {
          userId: privacyRequest.userId,
          closedAt: new Date(),
        },
      })

      return
    }
  } catch (error) {
    console.error("processPrivacyRequest error", error)

    privacyRequest.status = "FAILED"
    privacyRequest.retryCount = (privacyRequest.retryCount || 0) + 1
    await privacyRequest.save()

    await logAuditEvent({
      actor: { _id: privacyRequest.userId },
      action: "PRIVACY_REQUEST_PROCESSING_ERROR",
      targetType: "PrivacyRequest",
      targetId: privacyRequest.id || privacyRequest._id?.toString(),
      status: "failure",
      metadata: {
        userId: privacyRequest.userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        retryCount: privacyRequest.retryCount,
      },
    })

    throw error
  }
}
