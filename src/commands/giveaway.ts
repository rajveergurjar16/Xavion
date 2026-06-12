import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";
import {
  finishGiveaway,
  giveawayComponents,
  giveawayEmbed
} from "../services/giveaways.js";
import { extractId, parseDuration } from "../utils.js";
import { prefixArgs, slash } from "./helpers.js";
import type { Command } from "./types.js";
import { createGiveaway } from "../database/repositories/giveaways.js";

export const giveawayCommand: Command = {
  name: "giveaway",
  aliases: ["gstart", "gaw"],
  description: "Create and manage giveaways",
  userPermissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ],
  slash: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Create and manage giveaways")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start a giveaway")
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Duration such as 10m, 2h, or 1d")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("winners")
            .setDescription("Number of winners")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)
        )
        .addStringOption((option) =>
          option
            .setName("prize")
            .setDescription("Prize to give away")
            .setRequired(true)
            .setMaxLength(256)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for the giveaway")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("End a giveaway immediately")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("Giveaway message ID").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reroll")
        .setDescription("Pick new winners for an ended giveaway")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("Giveaway message ID").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(ctx) {
    const interaction = slash(ctx);
    const args = prefixArgs(ctx);
    const action = interaction?.options.getSubcommand() ?? args[0]?.toLowerCase();
    if (!["start", "end", "reroll"].includes(action ?? "")) {
      return ctx.reply(
        "Usage: `Xgiveaway start <duration> <winners> <prize>`, `Xgiveaway end <messageID>`, or `Xgiveaway reroll <messageID>`.",
        true,
        "info"
      );
    }

    if (action === "end" || action === "reroll") {
      const rawId =
        interaction?.options.getString("message_id", true) ?? args[1];
      const messageId = rawId ? extractId(rawId) : null;
      if (!messageId) return ctx.reply("Provide a valid giveaway message ID.", true, "error");
      try {
        const winners = await finishGiveaway(ctx.guild.client, messageId, action === "reroll");
        await ctx.reply(
          `${action === "reroll" ? "Rerolled" : "Ended"} the giveaway with ${winners.length} winner(s).`,
          true,
          "success"
        );
      } catch (error) {
        await ctx.reply(error instanceof Error ? error.message : "Could not update that giveaway.", true, "error");
      }
      return;
    }

    const durationText =
      interaction?.options.getString("duration", true) ?? args[1];
    const winnerCount =
      interaction?.options.getInteger("winners", true) ?? Number(args[2]);
    const prize =
      interaction?.options.getString("prize", true) ??
      args.slice(3).join(" ").trim();
    const duration = durationText ? parseDuration(durationText) : null;
    if (!duration || duration > 30 * 24 * 60 * 60 * 1_000) {
      return ctx.reply("Use a giveaway duration from `1s` to `30d`.", true, "error");
    }
    if (!Number.isSafeInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) {
      return ctx.reply("Winner count must be between 1 and 20.", true, "error");
    }
    if (!prize) return ctx.reply("A prize is required.", true, "error");

    const selectedChannel = interaction?.options.getChannel("channel");
    const channel =
      selectedChannel?.isTextBased() && !selectedChannel.isDMBased()
        ? selectedChannel
        : ctx.channel;
    const endsAt = Date.now() + duration;
    const message = await channel.send({
      embeds: [giveawayEmbed(prize, winnerCount, endsAt, ctx.member.id)],
      components: giveawayComponents()
    });
    await message.edit({ components: giveawayComponents(message.id) });
    await createGiveaway({
      messageId: message.id,
      guildId: ctx.guild.id,
      channelId: channel.id,
      hostId: ctx.member.id,
      prize,
      winnerCount,
      endsAt: new Date(endsAt)
    });
    await ctx.reply(`Giveaway started in <#${channel.id}> by <@${ctx.member.id}>.`, true, "success");
  }
};
