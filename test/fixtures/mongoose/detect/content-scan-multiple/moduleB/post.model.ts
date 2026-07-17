import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  title: String,
});

export const Post = mongoose.model("Post", postSchema);
