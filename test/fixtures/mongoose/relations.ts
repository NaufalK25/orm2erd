import mongoose from "mongoose";

// Reciprocal 1-n: Author has many Post, Post belongs to one Author.
const AuthorSchema = new mongoose.Schema({
  name: String,
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
});
const PostSchema = new mongoose.Schema({
  title: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "Author" },
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
const UserSchema = new mongoose.Schema({
  name: String,
  profile: { type: mongoose.Schema.Types.ObjectId, ref: "Profile", unique: true },
});

// Standalone unique singular ref, no reciprocal field on Person.
const AccountSchema = new mongoose.Schema({
  name: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Person", unique: true },
});

// Referenced by Account, Comment, and Team, but declares nothing back.
const PersonSchema = new mongoose.Schema({
  name: String,
});

// Standalone non-unique singular ref, no reciprocal field on Person.
const CommentSchema = new mongoose.Schema({
  text: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "Person" },
});

// Standalone array-only ref, no reciprocal field on Person.
const TeamSchema = new mongoose.Schema({
  name: String,
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "Person" }],
});

// Two distinct refs from Order to Warehouse — ambiguous, must NOT be merged
// into one relation even though they share the same model pair.
const WarehouseSchema = new mongoose.Schema({
  name: String,
});
const OrderSchema = new mongoose.Schema({
  number: String,
  originWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
  destinationWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
});

mongoose.model("Author", AuthorSchema);
mongoose.model("Post", PostSchema);
mongoose.model("Tag", TagSchema);
mongoose.model("Profile", ProfileSchema);
mongoose.model("User", UserSchema);
mongoose.model("Account", AccountSchema);
mongoose.model("Person", PersonSchema);
mongoose.model("Comment", CommentSchema);
mongoose.model("Team", TeamSchema);
mongoose.model("Warehouse", WarehouseSchema);
mongoose.model("Order", OrderSchema);
