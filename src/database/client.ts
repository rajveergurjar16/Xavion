import { setServers } from "node:dns";
import { MongoClient, type Db } from "mongodb";
import { config } from "../config.js";
import { logger } from "../logger.js";

let client: MongoClient | null = null;
let database: Db | null = null;
const connectionAttempts = 3;

export async function connectDatabase(): Promise<void> {
  if (database) return;
  if (
    config.MONGODB_URI.startsWith("mongodb+srv://") &&
    config.MONGODB_DNS_SERVERS.length
  ) {
    setServers(config.MONGODB_DNS_SERVERS);
  }

  for (let attempt = 1; attempt <= connectionAttempts; attempt++) {
    const nextClient = new MongoClient(config.MONGODB_URI, {
      maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
      minPoolSize: config.MONGODB_MIN_POOL_SIZE,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000
    });

    try {
      await nextClient.connect();
      const nextDatabase = nextClient.db(config.MONGODB_DATABASE);
      await nextDatabase.command({ ping: 1 });
      client = nextClient;
      database = nextDatabase;
      logger.info({ database: config.MONGODB_DATABASE }, "MongoDB connected");
      return;
    } catch (error) {
      await nextClient.close().catch(() => undefined);
      if (attempt === connectionAttempts) throw error;
      logger.warn(
        { attempt, attempts: connectionAttempts, error },
        "MongoDB connection failed; retrying"
      );
      await delay(attempt * 2_000);
    }
  }
}

export function getDatabase(): Db {
  if (!database) throw new Error("MongoDB is not connected.");
  return database;
}

export async function pingDatabase(): Promise<void> {
  await getDatabase().command({ ping: 1 });
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
