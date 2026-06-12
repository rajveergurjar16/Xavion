import { randomInt } from "node:crypto";
import type {
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  User
} from "discord.js";

const durationPattern = /(\d+)\s*(s|m|h|d|w)/gi;
const units: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000
};

export function parseDuration(input: string): number | null {
  let total = 0;
  let consumed = "";
  for (const match of input.matchAll(durationPattern)) {
    const amount = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    if (!unit || !Number.isSafeInteger(amount)) return null;
    total += amount * units[unit]!;
    consumed += match[0];
  }

  const normalizedInput = input.replace(/\s/g, "").toLowerCase();
  const normalizedConsumed = consumed.replace(/\s/g, "").toLowerCase();
  return total > 0 && normalizedInput === normalizedConsumed ? total : null;
}

export function formatDuration(durationMs: number): string {
  let remainingSeconds = Math.max(0, Math.ceil(durationMs / 1_000));
  const parts: string[] = [];
  const durationUnits = [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1]
  ] as const;

  for (const [label, seconds] of durationUnits) {
    const amount = Math.floor(remainingSeconds / seconds);
    if (amount > 0) {
      parts.push(`${amount}${label}`);
      remainingSeconds %= seconds;
    }
  }

  return parts.join(" ") || "0s";
}

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of input.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

export function extractId(value: string): string | null {
  return value.match(/\d{17,20}/)?.[0] ?? null;
}

export async function resolveUser(guild: Guild, value: string): Promise<User | null> {
  const id = extractId(value);
  if (!id) return null;
  return guild.client.users.fetch(id).catch(() => null);
}

export async function resolveMember(
  guild: Guild,
  value: string
): Promise<GuildMember | null> {
  const id = extractId(value);
  if (!id) return null;
  return guild.members.fetch(id).catch(() => null);
}

export function resolveTextChannel(
  guild: Guild,
  value: string | undefined,
  fallback: GuildTextBasedChannel
): GuildTextBasedChannel | null {
  if (!value) return fallback;
  const id = extractId(value);
  if (!id) return null;
  const channel = guild.channels.cache.get(id);
  return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
}

export function chooseRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  while (pool.length > 0 && chosen.length < count) {
    const index = randomInt(pool.length);
    chosen.push(pool.splice(index, 1)[0]!);
  }
  return chosen;
}

export function truncate(value: string, max = 1_000): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
