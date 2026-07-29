import mongoose from "mongoose";

const CustomerArchiveSchema = new mongoose.Schema(
  {
    fullName: String,
  },
  { collection: "tbl_customer" },
);

mongoose.model("CustomerArchive", CustomerArchiveSchema);
