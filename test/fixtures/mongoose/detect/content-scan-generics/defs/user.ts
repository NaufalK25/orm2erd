import { Schema, model } from "mongoose";

interface IUser {
  name: string;
}

const userSchema = new Schema<IUser>({
  name: String,
});

export const User = model<IUser>("User", userSchema);
