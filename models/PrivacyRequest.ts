import mongoose from "mongoose";

export interface IPrivacyRequest {
  _id: any;
  [key: string]: any;
}

const PrivacyRequestSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      ref: "User",
    },
    requestType: {
      type: String,
      enum: ["EXPORT", "CLOSURE"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      required: true,
      default: "PENDING",
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

export default (mongoose.models.PrivacyRequest ||
  mongoose.model<IPrivacyRequest>("PrivacyRequest", PrivacyRequestSchema)) as mongoose.Model<IPrivacyRequest>;
