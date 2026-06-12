import { getDatabase } from "../client.js";
import type { NicknameChannelDocument } from "../types.js";

const channels = () =>
  getDatabase().collection<NicknameChannelDocument>("nickname_channels");

export async function ensureNicknameChannelIndexes(): Promise<void> {
  await channels().createIndex(
    { guildId: 1, channelId: 1 },
    { unique: true }
  );
}

export async function hasNicknameChannel(
  guildId: string,
  channelId: string
): Promise<boolean> {
  return Boolean(await channels().findOne({ guildId, channelId }));
}

export async function addNicknameChannel(
  channel: NicknameChannelDocument
): Promise<boolean> {
  const result = await channels().updateOne(
    { guildId: channel.guildId, channelId: channel.channelId },
    { $setOnInsert: channel },
    { upsert: true }
  );
  return result.upsertedCount > 0;
}

export async function removeNicknameChannel(
  guildId: string,
  channelId: string
): Promise<boolean> {
  const result = await channels().deleteOne({ guildId, channelId });
  return result.deletedCount > 0;
}

export async function listNicknameChannels(
  guildId: string
): Promise<NicknameChannelDocument[]> {
  return channels().find({ guildId }).sort({ createdAt: 1 }).toArray();
}
