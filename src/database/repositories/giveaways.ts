import { getDatabase } from "../client.js";
import type { GiveawayDocument } from "../types.js";

const giveaways = () =>
  getDatabase().collection<GiveawayDocument>("giveaways");

export async function ensureGiveawayIndexes(): Promise<void> {
  await Promise.all([
    giveaways().createIndex({ messageId: 1 }, { unique: true }),
    giveaways().createIndex({ ended: 1, endsAt: 1 })
  ]);
}

export async function createGiveaway(
  giveaway: Omit<GiveawayDocument, "ended" | "entries">
): Promise<void> {
  await giveaways().insertOne({ ...giveaway, ended: false, entries: [] });
}

export async function getGiveaway(
  messageId: string
): Promise<GiveawayDocument | null> {
  return giveaways().findOne({ messageId });
}

export async function toggleGiveawayEntry(
  messageId: string,
  userId: string
): Promise<"entered" | "left" | "missing"> {
  const giveaway = await giveaways().findOne(
    { messageId },
    { projection: { entries: 1, ended: 1, endsAt: 1 } }
  );
  if (!giveaway || giveaway.ended || giveaway.endsAt.getTime() <= Date.now()) {
    return "missing";
  }
  const entered = giveaway.entries.includes(userId);
  await giveaways().updateOne(
    { messageId, ended: false },
    entered
      ? { $pull: { entries: userId } }
      : { $addToSet: { entries: userId } }
  );
  return entered ? "left" : "entered";
}

export async function markGiveawayEnded(messageId: string): Promise<void> {
  await giveaways().updateOne({ messageId }, { $set: { ended: true } });
}

export async function listDueGiveaways(limit = 20): Promise<string[]> {
  const due = await giveaways()
    .find({ ended: false, endsAt: { $lte: new Date() } })
    .project<{ messageId: string }>({ messageId: 1 })
    .limit(limit)
    .toArray();
  return due.map((giveaway) => giveaway.messageId);
}
