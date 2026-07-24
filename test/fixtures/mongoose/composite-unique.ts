import mongoose from "mongoose";

const MembershipSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  orgId: mongoose.Schema.Types.ObjectId,
  role: { type: String },
  // Single-field unique lives on the path — must NOT show up as a compound.
  slug: { type: String, unique: true },
});

// Compound unique index — the only way Mongoose expresses a multi-column unique.
MembershipSchema.index({ orgId: 1, role: 1 }, { unique: true });
// Compound non-unique index — must be ignored.
MembershipSchema.index({ userId: 1, role: 1 });

mongoose.model("Membership", MembershipSchema);
