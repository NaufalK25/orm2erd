import mongoose from "mongoose";

// This file's text matches the "looks like mongoose schema source" check
// (it imports mongoose and references Schema/model below), so it passes
// the content pre-filter and reaches the import step — but throws before
// getting there, so nothing here actually registers. The adapter should
// skip it, not abort the whole directory's extraction.
throw new Error("this file is broken on purpose");

const BrokenSchema = new mongoose.Schema({ name: String });
mongoose.model("Broken", BrokenSchema);
