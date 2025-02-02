import { MongoClient } from "mongodb";

const uri =
  "mongodb+srv://quard:Screaper228@cluster0.zyg0fil.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);

export default async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Connected to the database");
    return client.db();
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}
