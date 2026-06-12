import { getDatabase } from "../client.js";
import type { NoPrefixUserDocument } from "../types.js";

const users = () =>
  getDatabase().collection<NoPrefixUserDocument>("no_prefix_users");
const cache = new Set<string>();

export async function ensureNoPrefixIndexes(): Promise<void> {
  await users().createIndex({ userId: 1 }, { unique: true });
  const records = await users().find({}, { projection: { userId: 1 } }).toArray();
  cache.clear();
  for (const record of records) cache.add(record.userId);
}

export function isNoPrefixUser(userId: string): boolean {
  return cache.has(userId);
}

export async function addNoPrefixUser(
  user: NoPrefixUserDocument
): Promise<boolean> {
  const result = await users().updateOne(
    { userId: user.userId },
    { $setOnInsert: user },
    { upsert: true }
  );
  if (result.upsertedCount > 0) cache.add(user.userId);
  return result.upsertedCount > 0;
}

export async function removeNoPrefixUser(userId: string): Promise<boolean> {
  const result = await users().deleteOne({ userId });
  if (result.deletedCount > 0) cache.delete(userId);
  return result.deletedCount > 0;
}

export async function countNoPrefixUsers(): Promise<number> {
  return users().countDocuments();
}

export async function listNoPrefixUsers(
  page: number,
  pageSize: number
): Promise<NoPrefixUserDocument[]> {
  return users()
    .find()
    .sort({ addedAt: 1 })
    .skip(page * pageSize)
    .limit(pageSize)
    .toArray();
}
