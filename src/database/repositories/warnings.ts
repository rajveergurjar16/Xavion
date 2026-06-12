import { getDatabase } from "../client.js";
import type {
  WarningActionDocument,
  WarningDocument
} from "../types.js";

const warnings = () =>
  getDatabase().collection<WarningDocument>("warnings");
const actions = () =>
  getDatabase().collection<WarningActionDocument>("warning_actions");
const counters = () =>
  getDatabase().collection<{ _id: string; value: number }>("counters");

export async function ensureWarningIndexes(): Promise<void> {
  await Promise.all([
    warnings().createIndex({ guildId: 1, warningId: 1 }, { unique: true }),
    warnings().createIndex({ guildId: 1, userId: 1, createdAt: -1 }),
    actions().createIndex(
      { guildId: 1, warningCount: 1 },
      { unique: true }
    )
  ]);
}

export async function addWarning(
  data: Omit<WarningDocument, "warningId" | "createdAt">
): Promise<WarningDocument> {
  const counter = await counters().findOneAndUpdate(
    { _id: `warnings:${data.guildId}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const warning: WarningDocument = {
    ...data,
    warningId: counter!.value,
    createdAt: new Date()
  };
  await warnings().insertOne(warning);
  return warning;
}

export async function removeWarning(
  guildId: string,
  warningId: number
): Promise<WarningDocument | null> {
  return warnings().findOneAndDelete({ guildId, warningId });
}

export async function countWarnings(
  guildId: string,
  userId: string
): Promise<number> {
  return warnings().countDocuments({ guildId, userId });
}

export async function listWarnings(
  guildId: string,
  userId: string,
  page: number,
  pageSize: number
): Promise<WarningDocument[]> {
  return warnings()
    .find({ guildId, userId })
    .sort({ createdAt: -1 })
    .skip(page * pageSize)
    .limit(pageSize)
    .toArray();
}

export async function getWarningAction(
  guildId: string,
  warningCount: number
): Promise<WarningActionDocument | null> {
  return actions().findOne({ guildId, warningCount });
}

export async function listWarningActions(
  guildId: string
): Promise<WarningActionDocument[]> {
  return actions()
    .find({ guildId })
    .sort({ warningCount: 1 })
    .toArray();
}

export async function setWarningAction(
  action: WarningActionDocument
): Promise<void> {
  await actions().updateOne(
    { guildId: action.guildId, warningCount: action.warningCount },
    { $set: action },
    { upsert: true }
  );
}

export async function removeWarningAction(
  guildId: string,
  warningCount: number
): Promise<boolean> {
  const result = await actions().deleteOne({ guildId, warningCount });
  return result.deletedCount > 0;
}

export async function clearWarningActions(guildId: string): Promise<number> {
  const result = await actions().deleteMany({ guildId });
  return result.deletedCount;
}
