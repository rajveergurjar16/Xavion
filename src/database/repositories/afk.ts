import { getDatabase } from "../client.js";
import type { AfkUserDocument } from "../types.js";

const afkUsers = () => getDatabase().collection<AfkUserDocument>("afk_users");
const cache = new Map<string, AfkUserDocument>();

export async function ensureAfkIndexes(): Promise<void> {
  await afkUsers().createIndex({ userId: 1 }, { unique: true });
  const records = await afkUsers().find().toArray();
  cache.clear();
  for (const record of records) cache.set(record.userId, record);
}

export function getCachedAfkUser(userId: string): AfkUserDocument | null {
  return cache.get(userId) ?? null;
}

export async function setAfkUser(record: AfkUserDocument): Promise<void> {
  await afkUsers().updateOne(
    { userId: record.userId },
    { $set: record },
    { upsert: true }
  );
  cache.set(record.userId, record);
}

export async function removeAfkUser(userId: string): Promise<AfkUserDocument | null> {
  const record = cache.get(userId) ?? null;
  const result = await afkUsers().deleteOne({ userId });
  if (result.deletedCount > 0) cache.delete(userId);
  return record;
}
