import mongoose from "mongoose";

const CustomerArchiveSchema = new mongoose.Schema(
  {
    fullName: String,
  },
  { collection: "tbl_customer" },
);

mongoose.model("CustomerArchive", CustomerArchiveSchema);

// Explicit collection name that happens to equal the model name exactly —
// tableName must stay unset (only surfaced when it actually differs).
const TagSchema = new mongoose.Schema({ label: String });
mongoose.model("Tag", TagSchema, "Tag");
