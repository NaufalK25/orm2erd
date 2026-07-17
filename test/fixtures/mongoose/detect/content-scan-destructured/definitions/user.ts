import { Schema, model } from "mongoose";

const userSchema = new Schema({
  name: String,
});

export const User = model("User", userSchema);
