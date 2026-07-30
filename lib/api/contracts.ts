import { z } from "zod"

import { ApiErrorSchema } from "@/lib/api/errors"
import { DateRangeQuerySchema, PaginationMetaSchema, PaginationQuerySchema } from "@/lib/api/pagination"
import { IsoDateTimeSchema, MoneySchema, ObjectIdSchema } from "@/lib/api/serialization"
import type { DeprecationNotice } from "@/lib/api/versioning"

export { ApiErrorSchema }
export { MoneySchema, PaginationQuerySchema, PaginationMetaSchema }

/**
 * The authoritative description of every documented ChainMove endpoint.
 *
 * Route handlers are built from these entries via `defineRoute`, and
 * `docs/openapi/chainmove.openapi.json` is generated from them. Changing a
 * schema here changes the published contract, so CI runs drift and
 * compatibility checks on every commit. See `docs/api-conventions.md`.
 */
export type ApiContract = {
  operationId: string
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  path: string
  tag: string
  summary: string
  description?: string
  auth: "public" | "authenticated" | "admin" | "webhook"
  params?: z.ZodTypeAny
  query?: z.ZodTypeAny
  body?: z.ZodTypeAny
  response: z.ZodTypeAny
  successStatus?: number
  /** Non-JSON success payloads (file downloads) document a media type instead. */
  responseContentType?: string
  errors?: readonly number[]
  example?: unknown
  requestExample?: unknown
  deprecation?: DeprecationNotice
  deprecatedParameters?: readonly string[]
}

/** Error statuses every authenticated JSON endpoint can return. */
const BASE_ERRORS = [400, 401, 403, 500] as const

/* -------------------------------------------------------------------------- */
/* Shared value schemas                                                        */
/* -------------------------------------------------------------------------- */

export const SuccessFlagSchema = z.literal(true)

export const TransactionTypeSchema = z.enum([
  "investment",
  "loan_disbursement",
  "repayment",
  "deposit",
  "withdrawal",
  "return",
  "pool_investment",
  "wallet_funding",
  "wallet_debit",
  "down_payment",
])

export const TransactionStatusSchema = z.enum(["Pending", "Completed", "Failed"])
export const ReconciliationStatusSchema = z.enum(["reconciled", "pending", "failed", "duplicate"])
export const PoolStatusSchema = z.enum(["OPEN", "FUNDED", "CLOSED"])
export const UserRoleSchema = z.enum(["driver", "investor", "admin"])

/* -------------------------------------------------------------------------- */
/* Wallet                                                                      */
/* -------------------------------------------------------------------------- */

export const WalletTransactionSchema = z.object({
  id: ObjectIdSchema,
  type: TransactionTypeSchema,
  amount: MoneySchema,
  status: TransactionStatusSchema,
  method: z.string().nullable(),
  description: z.string(),
  reference: z.string().nullable().describe("Provider reference, when the transaction came from a gateway."),
  timestamp: IsoDateTimeSchema,
})

export const WalletSummaryResponseSchema = z.object({
  success: SuccessFlagSchema,
  wallet: z.object({
    internalBalance: MoneySchema,
    walletAddress: z.string().nullable().describe("Linked blockchain address, or null when none is linked."),
  }),
  transactions: z.array(WalletTransactionSchema),
})

/* -------------------------------------------------------------------------- */
/* Pools and investments                                                       */
/* -------------------------------------------------------------------------- */

export const PoolSummarySchema = z.object({
  id: ObjectIdSchema,
  assetType: z.string(),
  assetPrice: MoneySchema,
  targetAmount: MoneySchema,
  minContribution: MoneySchema,
  status: PoolStatusSchema,
  currentRaised: MoneySchema,
  remainingAmount: MoneySchema,
  investorCount: z.number().int().min(0),
  progressRatio: z.number().min(0).describe("currentRaised / targetAmount, clamped at 0 when no target."),
  description: z.string().nullable(),
  createdBy: ObjectIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  userOwnershipUnits: z.number().int().min(0).optional(),
  userOwnershipBps: z.number().int().min(0).optional(),
  userInvested: MoneySchema.optional(),
})

export const PoolListQuerySchema = z.object({
  status: PoolStatusSchema.optional().describe("Filters pools by lifecycle status."),
})

export const PoolListResponseSchema = z.object({
  success: SuccessFlagSchema,
  pools: z.array(PoolSummarySchema),
})

/** Mirrors `PoolAssetType` in models/InvestmentPool.ts. */
export const PoolAssetTypeSchema = z.enum(["SHUTTLE", "KEKE"])

export const PoolCreateRequestSchema = z
  .object({
    assetType: PoolAssetTypeSchema,
    targetAmountNgn: z.coerce.number().positive().max(1_000_000_000).optional(),
    minContributionNgn: z.coerce.number().positive().max(1_000_000_000).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict()

export const PoolCreateResponseSchema = z.object({
  success: SuccessFlagSchema,
  pool: PoolSummarySchema,
})

export const PoolInvestParamsSchema = z.object({
  poolId: ObjectIdSchema.describe("Investment pool identifier."),
})

export const PoolInvestmentRequestSchema = z
  .object({
    amountNgn: z.coerce.number().positive().max(100_000_000).describe("Contribution in NGN major units."),
    txRef: z.string().trim().max(128).optional().describe("Client idempotency reference."),
  })
  .strict()

export const PoolInvestmentResponseSchema = z.object({
  success: SuccessFlagSchema,
  investment: z.object({
    poolId: ObjectIdSchema,
    userId: ObjectIdSchema,
    amount: MoneySchema,
    ownershipUnits: z.number().int().min(0),
    ownershipBps: z.number().int().min(0),
    txRef: z.string(),
    poolStatus: PoolStatusSchema,
    currentRaised: MoneySchema,
    targetAmount: MoneySchema,
    investorCount: z.number().int().min(0),
    userBalance: MoneySchema,
  }),
})

export const InvestmentListQuerySchema = z.object({
  investorId: ObjectIdSchema.optional().describe("Admin-only. Scopes results to one investor."),
})

/** Mirrors models/Investment.ts. Every field here exists on the document. */
export const InvestmentSchema = z.object({
  id: ObjectIdSchema,
  investorId: z.string().nullable(),
  loanId: z.string().nullable(),
  vehicleId: z.string().nullable(),
  amount: MoneySchema,
  monthlyReturn: MoneySchema,
  status: z.string(),
  date: IsoDateTimeSchema.nullable().describe("When the investment was recorded."),
})

export const InvestmentListResponseSchema = z.object({
  success: SuccessFlagSchema,
  investments: z.array(InvestmentSchema),
})

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

export const PaymentInitializeRequestSchema = z
  .object({
    amountNgn: z.coerce.number().positive().max(100_000_000).describe("Funding amount in NGN major units."),
    email: z.string().trim().email().max(254).optional().describe("Overrides the account email for this checkout."),
  })
  .strict()

export const PaymentInitializeResponseSchema = z.object({
  success: SuccessFlagSchema,
  payment: z.object({
    authorizationUrl: z.string().url().describe("Redirect the payer here to complete checkout."),
    accessCode: z.string(),
    reference: z.string().describe("ChainMove-generated reference for reconciliation."),
    amount: MoneySchema,
  }),
})

export const WebhookPaystackRequestSchema = z.object({
  event: z.string(),
  data: z.record(z.unknown()),
})

/**
 * Documents the acknowledgement shapes `app/api/payments/webhook` actually
 * returns today. This route is not yet built on `defineRoute` — it performs its
 * own signature verification and idempotency handling — so the schema is
 * maintained to match the handler rather than enforced by it.
 */
export const WebhookAckResponseSchema = z.object({
  status: z.enum(["success", "ignored"]),
  type: z.string().optional().describe("Settlement type resolved for the event."),
  alreadyProcessed: z.boolean().optional().describe("True when the event was a duplicate delivery."),
  reason: z.string().optional().describe("Why a verified event was ignored."),
})

/* -------------------------------------------------------------------------- */
/* Driver                                                                      */
/* -------------------------------------------------------------------------- */

export const DriverVirtualAccountResponseSchema = z.object({
  success: SuccessFlagSchema,
  virtualAccount: z.object({
    accountNumber: z.string(),
    accountName: z.string(),
    bankName: z.string(),
    providerSlug: z.string(),
    status: z.string(),
    contractId: z.string(),
    remainingBalance: MoneySchema,
    nextPaymentAmount: MoneySchema,
    isMock: z.boolean().describe("True when served by the mock payment adapter."),
  }),
})

/* -------------------------------------------------------------------------- */
/* Fleet                                                                       */
/* -------------------------------------------------------------------------- */

export const VehicleDocumentTypeSchema = z.enum([
  "insurance_certificate",
  "roadworthiness",
  "hackney_permit",
  "vehicle_license",
  "inspection_certificate",
  "other",
])

export const VehicleDocumentStatusSchema = z.enum(["pending", "verified", "expired", "rejected"])

export const VehicleDocumentSchema = z.object({
  id: ObjectIdSchema,
  vehicleId: ObjectIdSchema,
  documentType: VehicleDocumentTypeSchema,
  title: z.string(),
  documentNumber: z.string().nullable(),
  issuingAuthority: z.string().nullable(),
  issueDate: IsoDateTimeSchema.nullable(),
  expiryDate: IsoDateTimeSchema.nullable(),
  verificationStatus: VehicleDocumentStatusSchema,
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  updatedAt: IsoDateTimeSchema.nullable(),
})

export const FleetDocumentQuerySchema = z.object({
  vehicleId: ObjectIdSchema.optional().describe("Scopes documents to a single vehicle."),
  documentType: VehicleDocumentTypeSchema.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const FleetDocumentListResponseSchema = z.object({
  success: SuccessFlagSchema,
  documents: z.array(VehicleDocumentSchema),
  pagination: PaginationMetaSchema,
})

export const FleetDocumentCreateRequestSchema = z
  .object({
    vehicleId: ObjectIdSchema,
    documentType: VehicleDocumentTypeSchema,
    title: z.string().trim().min(1).max(200),
    documentNumber: z.string().trim().max(120).optional(),
    issuingAuthority: z.string().trim().max(200).optional(),
    issueDate: z.string().trim().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    expiryDate: z.string().trim().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    fileUrl: z.string().trim().url().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()

export const FleetDocumentCreateResponseSchema = z.object({
  success: SuccessFlagSchema,
  document: VehicleDocumentSchema,
})

/* -------------------------------------------------------------------------- */
/* Reporting: transaction ledger                                               */
/* -------------------------------------------------------------------------- */

/**
 * The ledger accepts pagination plus a filter set. It is declared as one flat
 * object (rather than composed with `.merge`) so the OpenAPI generator emits
 * every filter as an individual documented query parameter.
 */
export const LedgerListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    type: TransactionTypeSchema.optional(),
    status: TransactionStatusSchema.optional(),
    method: z.string().trim().max(40).optional(),
    reconciliation: ReconciliationStatusSchema.optional(),
    userType: UserRoleSchema.optional().describe("Admin-only filter."),
    userId: ObjectIdSchema.optional().describe("Admin-only filter."),
  })
  .merge(DateRangeQuerySchema)

export const LedgerEntrySchema = z.object({
  id: ObjectIdSchema,
  userId: z.string(),
  userType: z.string(),
  userName: z.string().nullable().describe("Populated for admin scope only."),
  userEmail: z.string().nullable().describe("Populated for admin scope only."),
  type: z.string(),
  direction: z.enum(["credit", "debit"]),
  amount: MoneySchema,
  originalAmount: MoneySchema.nullable().describe("Pre-conversion amount when the transaction was cross-currency."),
  exchangeRate: z.number().nullable(),
  method: z.string().nullable(),
  reference: z.string().nullable(),
  description: z.string(),
  status: TransactionStatusSchema,
  reconciliation: ReconciliationStatusSchema,
  relatedId: z.string().nullable(),
  timestamp: IsoDateTimeSchema,
})

export const LedgerSummarySchema = z.object({
  totalCount: z.number().int().min(0),
  totalAmount: MoneySchema,
  completedCount: z.number().int().min(0),
  completedAmount: MoneySchema,
  pendingCount: z.number().int().min(0),
  pendingAmount: MoneySchema,
  failedCount: z.number().int().min(0),
  failedAmount: MoneySchema,
  duplicateCount: z.number().int().min(0),
})

export const LedgerListResponseSchema = z.object({
  success: SuccessFlagSchema,
  scope: z.enum(["global", "self"]).describe("`global` for admins; `self` for other roles."),
  transactions: z.array(LedgerEntrySchema),
  pagination: PaginationMetaSchema,
  summary: LedgerSummarySchema,
})

/* -------------------------------------------------------------------------- */
/* Admin: KYC review queue                                                     */
/* -------------------------------------------------------------------------- */

export const KycStatusSchema = z.enum([
  "none",
  "pending",
  "approved_stage1",
  "pending_stage2",
  "approved_stage2",
  "rejected",
])

export const KycRequestSchema = z.object({
  id: ObjectIdSchema,
  role: UserRoleSchema,
  name: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  kycStatus: KycStatusSchema,
  documentCount: z.number().int().min(0),
  /**
   * Opaque handles the reviewer passes to `GET /api/kyc-documents`, which
   * re-authorizes each request and decrypts the blob. A reference is not a bearer
   * capability, so publishing it to an already-authorized reviewer is safe —
   * but it is scoped to this admin-only endpoint and must not be echoed onto
   * any investor- or driver-facing response.
   */
  documentReferences: z.array(z.string()).describe("Admin-only. Resolve via GET /api/kyc-documents."),
  rejectionReason: z.string().nullable(),
  physicalMeetingStatus: z.string().nullable(),
  physicalMeetingDate: IsoDateTimeSchema.nullable(),
  updatedAt: IsoDateTimeSchema.nullable(),
})

export const KycRequestListQuerySchema = z.object({
  status: KycStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const KycRequestListResponseSchema = z.object({
  success: SuccessFlagSchema,
  requests: z.array(KycRequestSchema),
  pagination: PaginationMetaSchema,
})

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export const apiContracts: ApiContract[] = [
  {
    operationId: "getWalletSummary",
    method: "GET",
    path: "/api/wallet/summary",
    tag: "wallet",
    summary: "Internal wallet balance and recent activity.",
    auth: "authenticated",
    response: WalletSummaryResponseSchema,
    errors: BASE_ERRORS,
    example: {
      success: true,
      wallet: {
        internalBalance: { currency: "NGN", amountMinor: 4500000, amountMajor: 45000 },
        walletAddress: null,
      },
      transactions: [
        {
          id: "665f1a2b3c4d5e6f70819203",
          type: "wallet_funding",
          amount: { currency: "NGN", amountMinor: 2500000, amountMajor: 25000 },
          status: "Completed",
          method: "paystack",
          description: "Wallet funding",
          reference: "cm_wallet_1738240000_ab12cd",
          timestamp: "2026-01-30T09:15:00.000Z",
        },
      ],
    },
  },
  {
    operationId: "listPools",
    method: "GET",
    path: "/api/pools",
    tag: "investments",
    summary: "Investment pools visible to the caller.",
    auth: "authenticated",
    query: PoolListQuerySchema,
    response: PoolListResponseSchema,
    errors: BASE_ERRORS,
  },
  {
    operationId: "createPool",
    method: "POST",
    path: "/api/pools",
    tag: "investments",
    summary: "Create an investment pool.",
    auth: "authenticated",
    body: PoolCreateRequestSchema,
    response: PoolCreateResponseSchema,
    successStatus: 201,
    errors: [...BASE_ERRORS, 409],
    requestExample: { assetType: "KEKE", targetAmountNgn: 2500000, description: "Lagos tricycle pool" },
  },
  {
    operationId: "investInPool",
    method: "POST",
    path: "/api/pools/{poolId}/invest",
    tag: "investments",
    summary: "Contribute to an investment pool from the internal wallet.",
    description:
      "Debits the caller's internal NGN wallet and records ownership units. " +
      "Retries are safe when the same `txRef` is supplied.",
    auth: "authenticated",
    params: PoolInvestParamsSchema,
    body: PoolInvestmentRequestSchema,
    response: PoolInvestmentResponseSchema,
    successStatus: 201,
    errors: [400, 401, 403, 404, 409, 500, 503],
    requestExample: { amountNgn: 50000, txRef: "client-generated-ref-001" },
  },
  {
    operationId: "listInvestments",
    method: "GET",
    path: "/api/investments",
    tag: "investments",
    summary: "Investments belonging to the caller, or to a named investor for admins.",
    auth: "authenticated",
    query: InvestmentListQuerySchema,
    response: InvestmentListResponseSchema,
    errors: [...BASE_ERRORS, 404],
  },
  {
    operationId: "initializePayment",
    method: "POST",
    path: "/api/payments/initialize",
    tag: "payments",
    summary: "Start a Paystack checkout to fund the internal wallet.",
    auth: "authenticated",
    body: PaymentInitializeRequestSchema,
    response: PaymentInitializeResponseSchema,
    successStatus: 201,
    errors: [400, 401, 403, 429, 500, 502],
    requestExample: { amountNgn: 25000 },
  },
  {
    operationId: "paystackWebhook",
    method: "POST",
    path: "/api/payments/webhook",
    tag: "webhooks",
    summary: "Paystack event receiver.",
    description:
      "Verifies the `x-paystack-signature` header before processing. " +
      "Always acknowledges verified events so Paystack does not retry indefinitely. " +
      "Documented only: this handler is not yet built on the shared route wrapper.",
    auth: "webhook",
    body: WebhookPaystackRequestSchema,
    response: WebhookAckResponseSchema,
    successStatus: 200,
    errors: [400, 401, 500],
  },
  {
    operationId: "getDriverVirtualAccount",
    method: "GET",
    path: "/api/driver/virtual-account",
    tag: "driver",
    summary: "Dedicated bank account for driver repayments.",
    description: "Provisions the account on first call. Requires an active hire-purchase contract.",
    auth: "authenticated",
    response: DriverVirtualAccountResponseSchema,
    errors: [400, 401, 403, 404, 500, 502],
  },
  {
    operationId: "listVehicleDocuments",
    method: "GET",
    path: "/api/fleet/documents",
    tag: "fleet",
    summary: "Compliance documents for fleet vehicles.",
    auth: "authenticated",
    query: FleetDocumentQuerySchema,
    response: FleetDocumentListResponseSchema,
    errors: BASE_ERRORS,
  },
  {
    operationId: "createVehicleDocument",
    method: "POST",
    path: "/api/fleet/documents",
    tag: "fleet",
    summary: "Record a compliance document against a vehicle.",
    auth: "authenticated",
    body: FleetDocumentCreateRequestSchema,
    response: FleetDocumentCreateResponseSchema,
    successStatus: 201,
    errors: [...BASE_ERRORS, 404],
  },
  {
    operationId: "listLedgerTransactions",
    method: "GET",
    path: "/api/transactions/ledger",
    tag: "reporting",
    summary: "Paginated transaction ledger with reconciliation state.",
    description:
      "Admins see every transaction (`scope: global`); other roles see only their own (`scope: self`).",
    auth: "authenticated",
    query: LedgerListQuerySchema,
    response: LedgerListResponseSchema,
    errors: BASE_ERRORS,
    deprecatedParameters: ["limit"],
  },
  {
    operationId: "listKycRequests",
    method: "GET",
    path: "/api/admin/kyc-requests",
    tag: "admin",
    summary: "KYC review queue.",
    auth: "admin",
    query: KycRequestListQuerySchema,
    response: KycRequestListResponseSchema,
    errors: BASE_ERRORS,
  },
]

/* -------------------------------------------------------------------------- */
/* Client-facing types                                                         */
/* -------------------------------------------------------------------------- */

export type WalletSummaryResponse = z.infer<typeof WalletSummaryResponseSchema>
export type PoolSummary = z.infer<typeof PoolSummarySchema>
export type PoolListResponse = z.infer<typeof PoolListResponseSchema>
export type PoolCreateRequest = z.infer<typeof PoolCreateRequestSchema>
export type PoolInvestmentRequest = z.infer<typeof PoolInvestmentRequestSchema>
export type PoolInvestmentResponse = z.infer<typeof PoolInvestmentResponseSchema>
export type InvestmentListResponse = z.infer<typeof InvestmentListResponseSchema>
export type PaymentInitializeRequest = z.infer<typeof PaymentInitializeRequestSchema>
export type PaymentInitializeResponse = z.infer<typeof PaymentInitializeResponseSchema>
export type DriverVirtualAccountResponse = z.infer<typeof DriverVirtualAccountResponseSchema>
export type VehicleDocument = z.infer<typeof VehicleDocumentSchema>
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>
export type LedgerListResponse = z.infer<typeof LedgerListResponseSchema>
export type KycRequest = z.infer<typeof KycRequestSchema>
