import mongoose from "mongoose";

// A custom SchemaType (e.g. from a third-party plugin like mongoose-long)
// whose `.instance` isn't in MONGOOSE_TYPE_TO_CANONICAL at all — as opposed
// to Mixed/Union above, which ARE in the map (mapped to "unknown" there).
class CustomType extends mongoose.SchemaType {
  constructor(key: string, options?: mongoose.SchemaTypeOptions<unknown>) {
    super(key, options, "CustomType");
  }
  cast(val: unknown) {
    return val;
  }
}
(mongoose.Schema.Types as Record<string, unknown>).CustomType = CustomType;

const ProductSchema = new mongoose.Schema({
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
  // A plain-object default (as opposed to a primitive or a computed
  // function default like createdAt above) — must be JSON-stringified.
  metadata: { type: mongoose.Schema.Types.Mixed, default: { source: "import" } },
  // A genuinely anonymous function default (JS's name-inference for a
  // direct property-value function expression would otherwise name it
  // after the property, so pull it from an array to sidestep that).
  slug: { type: String, default: [() => "generated"][0] },
  weird: { type: CustomType },
});

mongoose.model("Product", ProductSchema);
