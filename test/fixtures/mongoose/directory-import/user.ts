import mongoose from "mongoose";

const DirUserSchema = new mongoose.Schema({
  name: String,
});

mongoose.model("DirUser", DirUserSchema);
