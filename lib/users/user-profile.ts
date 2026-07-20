export interface UserProfileSnapshot {
  id: string
  name: string
  fullName: string
  email: string | null
  phoneNumber: string | null
  privyUserId: string | null
  address: string | null
  bio: string | null
  role: string
  walletAddress: string | null
  stellarPublicKey: string | null
  availableBalance: number
  totalInvested: number
  totalReturns: number
  createdAt: string | null
}

export const USER_PROFILE_SELECT =
  "name fullName email phoneNumber privyUserId address bio role walletAddress walletaddress stellarPublicKey availableBalance totalInvested totalReturns createdAt"

export function resolveUserDisplayName(user: {
  name?: string | null
  fullName?: string | null
  email?: string | null
}) {
  return user.fullName || user.name || user.email || "Unnamed user"
}

export function resolveUserWalletAddress(user: {
  walletAddress?: string | null
  walletaddress?: string | null
}) {
  return user.walletAddress || user.walletaddress || null
}

function toIsoDate(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value as string)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function toUserProfileSnapshot(user: any): UserProfileSnapshot {
  return {
    id: user._id.toString(),
    name: user.name,
    fullName: user.fullName || user.name,
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    privyUserId: user.privyUserId || null,
    address: user.address || null,
    bio: user.bio || null,
    role: user.role,
    walletAddress: resolveUserWalletAddress(user),
    stellarPublicKey: user.stellarPublicKey || null,
    availableBalance: Number(user.availableBalance || 0),
    totalInvested: Number(user.totalInvested || 0),
    totalReturns: Number(user.totalReturns || 0),
    createdAt: toIsoDate(user.createdAt),
  }
}

export function resolveDashboardUserStatus(user: {
  role?: string | null
  isKycVerified?: boolean | null
  kycVerified?: boolean | null
  kycStatus?: string | null
}) {
  if (user.role === "admin") return "System Administrator"

  const rawKycStatus = typeof user.kycStatus === "string" ? user.kycStatus.toLowerCase() : ""
  const isVerified =
    user.isKycVerified === true ||
    user.kycVerified === true ||
    ["approved", "approved_stage1", "approved_stage2", "verified", "complete", "completed"].includes(rawKycStatus)

  const roleLabel =
    user.role === "driver" ? "Driver" : user.role === "investor" ? "Investor" : user.role ? user.role : "User"

  return isVerified ? `Verified ${roleLabel}` : `${roleLabel} Account`
}
