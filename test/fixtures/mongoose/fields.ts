import mongoose from "mongoose";

const WidgetSchema = new mongoose.Schema({
  label: { type: String, required: true },
  weight: Number,
  isActive: { type: Boolean, default: true },
  releasedAt: Date,
  createdAt: { type: Date, default: Date.now },
  price: mongoose.Schema.Types.Decimal128,
  blob: Buffer,
  attributes: Map,
  anything: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  sku: { type: String, unique: true },
  labels: [String],
});

mongoose.model("Widget", WidgetSchema);
