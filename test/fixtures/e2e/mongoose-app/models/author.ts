import mongoose from "mongoose";

const AuthorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  // Reciprocal 1-n: Author has many Post, Post belongs to one Author.
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
});

export const Author = mongoose.model("Author", AuthorSchema);
