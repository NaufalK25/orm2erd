import mongoose from "mongoose";

const DirPostSchema = new mongoose.Schema({
  title: String,
});

mongoose.model("DirPost", DirPostSchema);
