import {
  Collection,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Message
} from "discord.js";
import { extractId } from "../utils.js";
import { prefixArgs, slash } from "./helpers.js";
import type { Command, CommandContext } from "./types.js";
import { sendModerationLog } from "../services/modlogs.js";

const fourteenDays = 14 * 24 * 60 * 60 * 1_000;
const maxFetchPages = 10;

export const purgeCommand: Command = {
  name: "purge",
  aliases: ["clear"],
  description: "Delete recent messages, optionally from one user",
  userPermissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ],
  cooldown: 3_000,
  slash: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages, optionally from one user")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Only delete messages from this user")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(ctx) {
    const parsed = parsePurgeInput(ctx);
    if (!parsed) {
      return ctx.reply(
        "Usage: `Xpurge <1-100>` or `Xpurge @user <1-100>`.",
        true,
        "error"
      );
    }

    if (ctx.source.kind === "prefix") {
      await ctx.source.message.delete().catch(() => undefined);
    }

    const messages = await collectMessages(ctx, parsed.amount, parsed.userId);
    if (messages.size === 0) {
      return ctx.reply(
        parsed.userId
          ? `No recent messages from <@${parsed.userId}> can be deleted.`
          : "No recent messages can be deleted.",
        true,
        "info"
      );
    }

    const deleted = await ctx.channel.bulkDelete(messages, true);
    await sendModerationLog(ctx.guild, {
      action: "Messages Purged",
      moderatorId: ctx.member.id,
      target: parsed.userId
        ? `<@${parsed.userId}> (${parsed.userId}) in <#${ctx.channel.id}>`
        : `<#${ctx.channel.id}>`,
      details: `${deleted.size} message(s) deleted.`,
      dmStatus: "not_applicable"
    });
    await ctx.reply(
      `Deleted **${deleted.size}** message(s)${
        parsed.userId ? ` from <@${parsed.userId}>` : ""
      }. Messages older than 14 days are skipped.`,
      true,
      "success"
    );
  }
};

function parsePurgeInput(
  ctx: CommandContext
): { amount: number; userId: string | null } | null {
  const interaction = slash(ctx);
  if (interaction) {
    return {
      amount: interaction.options.getInteger("amount", true),
      userId: interaction.options.getUser("user")?.id ?? null
    };
  }

  const args = prefixArgs(ctx);
  const firstId = args[0] ? extractId(args[0]) : null;
  const amount = Number(firstId ? args[1] : args[0]);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) return null;
  return { amount, userId: firstId };
}

async function collectMessages(
  ctx: CommandContext,
  amount: number,
  userId: string | null
): Promise<Collection<string, Message<true>>> {
  const collected = new Collection<string, Message<true>>();
  let before: string | undefined;
  const cutoff = Date.now() - fourteenDays;

  for (let page = 0; page < maxFetchPages && collected.size < amount; page++) {
    const batch = await ctx.channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });
    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (message.createdTimestamp <= cutoff) return collected;
      if (!userId || message.author.id === userId) {
        collected.set(message.id, message);
        if (collected.size >= amount) break;
      }
    }
    before = batch.last()?.id;
    if (!before) break;
  }

  return collected;
}
