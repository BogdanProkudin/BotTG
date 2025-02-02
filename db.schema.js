import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  photo: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
});

export default mongoose.model("Item", itemSchema);
