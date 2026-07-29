import mongoose from "mongoose";

// Reciprocal 1-n: User has many Post, Post belongs to one User.
const UserSchema = new mongoose.Schema({
  name: String,
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  profile: { type: mongoose.Schema.Types.ObjectId, ref: "Profile", unique: true },
});
const PostSchema = new mongoose.Schema({
  title: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
});

// Reciprocal n-n: Post <-> Tag via ref arrays on both sides.
const TagSchema = new mongoose.Schema({
  name: String,
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
});

// Reciprocal 1-1: Profile <-> User, both singular and unique.
const ProfileSchema = new mongoose.Schema({
  bio: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
});

// Standalone unique singular ref, no reciprocal field on Customer.
const ProductSchema = new mongoose.Schema({
  name: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", unique: true },
});

// Standalone unique + required singular ref, no reciprocal field on Customer
// — required: true means isFromOptional should be false, unlike Product's
// owner above.
const TransactionSchema = new mongoose.Schema({
  name: String,
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    unique: true,
    required: true,
  },
});

// Referenced by Product, Transaction, and Order, but declares nothing back.
const CustomerSchema = new mongoose.Schema({
  name: String,
});

// Standalone non-unique singular ref, no reciprocal field on User.
const CommentSchema = new mongoose.Schema({
  text: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// Two distinct refs from Order to Warehouse — ambiguous, must NOT be merged
// into one relation even though they share the same model pair. `customers`
// is a standalone array-only ref, no reciprocal field on Customer.
const WarehouseSchema = new mongoose.Schema({
  name: String,
});
const OrderSchema = new mongoose.Schema({
  number: String,
  originWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
  destinationWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
  customers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Customer" }],
});

mongoose.model("User", UserSchema);
mongoose.model("Post", PostSchema);
mongoose.model("Tag", TagSchema);
mongoose.model("Profile", ProfileSchema);
mongoose.model("Product", ProductSchema);
mongoose.model("Transaction", TransactionSchema);
mongoose.model("Customer", CustomerSchema);
mongoose.model("Comment", CommentSchema);
mongoose.model("Warehouse", WarehouseSchema);
mongoose.model("Order", OrderSchema);
