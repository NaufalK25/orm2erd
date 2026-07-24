import mongoose from "mongoose";

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "Author", required: true },
  // Reciprocal n-n: Post <-> Tag via ref arrays on both sides.
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
});

// One title per author — the only multi-column grouping Mongoose expresses.
PostSchema.index({ author: 1, title: 1 }, { unique: true });

export const Post = mongoose.model("Post", PostSchema);
