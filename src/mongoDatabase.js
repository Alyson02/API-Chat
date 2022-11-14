import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

export default class Mongo {
  mongo;
  db;

  constructor() {
    this.mongo = new MongoClient(`${process.env.MONGO_URI}`);
    this.db = this.mongo.db("");
  }

  async openInstance() {
    await this.mongo.connect();
    this.db = this.mongo.db(`${process.env.MONGO_DB}`);
  }

  async closeInstance() {
    await this.mongo.close();
  }
}

export const mongoDatabase = new Mongo();
