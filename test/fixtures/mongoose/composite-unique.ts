import mongoose from "mongoose";

const PostTagSchema = new mongoose.Schema({
  postId: mongoose.Schema.Types.ObjectId,
  tagId: mongoose.Schema.Types.ObjectId,
  addedBy: { type: String },
  // Single-field unique lives on the path — must NOT show up as a compound.
  slug: { type: String, unique: true },
});

// Compound unique index — the only way Mongoose expresses a multi-column unique.
PostTagSchema.index({ tagId: 1, addedBy: 1 }, { unique: true });
// Compound non-unique index — carried as a plain Index instead of a unique.
PostTagSchema.index({ postId: 1, addedBy: 1 }, { name: "post_addedby_idx" });
// Single-field non-unique index.
PostTagSchema.index({ addedBy: 1 });

mongoose.model("PostTag", PostTagSchema);
