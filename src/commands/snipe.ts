import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";
import { buildSnipePayload } from "../services/snipes.js";
import type { Command } from "./types.js";

export const snipeCommand: Command = {
  name: "snipe",
  aliases: ["snipes"],
  description: "View the last 5 deleted messages in this channel",
  userPermissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks],
  slash: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("View the last 5 deleted messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(ctx) {
    const payload = buildSnipePayload(ctx.member.id, ctx.channel.id);
    if (!payload) {
      return ctx.reply("No deleted messages are stored for this channel.", true, "info");
    }

    await ctx.replyPayload?.(
      {
        ...payload,
        allowedMentions: { repliedUser: false, users: [] },
        flags: MessageFlags.Ephemeral
      },
      true
    );
  }
};
