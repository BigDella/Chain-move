import mongoose, { Document, Schema } from "mongoose"

export type ReconciliationRunStatus = "in_progress" | "completed" | "failed"

export interface IReconciliationRunMetrics {
  totalProviderRecords: number
  totalInternalRecords: number
  matchedRecords: number
  discrepancyCount: number
  remediatedCount: number
}

export interface IReconciliationRun extends Document {
  runId: string
  provider: "paystack"
  periodStart: Date
  periodEnd: Date
  status: ReconciliationRunStatus
  startedAt: Date
  completedAt?: Date
  triggeredBy: string
  metrics: IReconciliationRunMetrics
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}

const ReconciliationRunSchema = new Schema<IReconciliationRun>(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["paystack"],
      default: "paystack",
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "failed"],
      default: "in_progress",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    triggeredBy: {
      type: String,
      default: "system",
      trim: true,
    },
    metrics: {
      totalProviderRecords: { type: Number, default: 0 },
      totalInternalRecords: { type: Number, default: 0 },
      matchedRecords: { type: Number, default: 0 },
      discrepancyCount: { type: Number, default: 0 },
      remediatedCount: { type: Number, default: 0 },
    },
    errorMessage: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
)

ReconciliationRunSchema.index({ periodStart: 1, periodEnd: 1 })

export default (mongoose.models.ReconciliationRun ||
  mongoose.model<IReconciliationRun>(
    "ReconciliationRun",
    ReconciliationRunSchema,
  )) as mongoose.Model<IReconciliationRun>
