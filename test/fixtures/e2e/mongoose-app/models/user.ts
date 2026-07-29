import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  // Reciprocal 1-n: User has many Post, Post belongs to one User.
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
});

export const User = mongoose.model("User", UserSchema);
