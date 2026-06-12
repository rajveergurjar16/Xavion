import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type User
} from "discord.js";
import type { CommandContext } from "./types.js";
import { resolveMember, resolveUser } from "../utils.js";

export function slash(ctx: CommandContext): ChatInputCommandInteraction<"cached"> | null {
  return ctx.source.kind === "slash" ? ctx.source.interaction : null;
}

export function prefixArgs(ctx: CommandContext): string[] {
  return ctx.source.kind === "prefix" ? ctx.source.args : [];
}

export async function targetMember(
  ctx: CommandContext,
  option = "user",
  argIndex = 0
): Promise<GuildMember | null> {
  const interaction = slash(ctx);
  if (interaction) return interaction.options.getMember(option);
  const value = prefixArgs(ctx)[argIndex];
  return value ? resolveMember(ctx.guild, value) : null;
}

export async function targetUser(
  ctx: CommandContext,
  option = "user",
  argIndex = 0
): Promise<User | null> {
  const interaction = slash(ctx);
  if (interaction) return interaction.options.getUser(option);
  const value = prefixArgs(ctx)[argIndex];
  return value ? resolveUser(ctx.guild, value) : null;
}

export function textOption(
  ctx: CommandContext,
  name: string,
  startIndex: number,
  required = false
): string | null {
  const interaction = slash(ctx);
  if (interaction) return interaction.options.getString(name, required);
  const value = prefixArgs(ctx).slice(startIndex).join(" ").trim();
  return value || null;
}

export function hierarchyError(
  actor: GuildMember,
  target: GuildMember,
  bot: GuildMember
): string | null {
  if (target.id === actor.id) return "You cannot moderate yourself.";
  if (target.id === target.guild.ownerId) return "The server owner cannot be moderated.";
  if (
    actor.id !== actor.guild.ownerId &&
    actor.roles.highest.comparePositionTo(target.roles.highest) <= 0
  ) {
    return "Your highest role must be above the target's highest role.";
  }
  if (bot.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return "My highest role must be above the target's highest role.";
  }
  return null;
}

export const defaultModerationPermissions = {
  ban: PermissionFlagsBits.BanMembers,
  kick: PermissionFlagsBits.KickMembers,
  timeout: PermissionFlagsBits.ModerateMembers
} as const;

export async function deferEphemeral(ctx: CommandContext): Promise<void> {
  const interaction = slash(ctx);
  if (interaction && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}
