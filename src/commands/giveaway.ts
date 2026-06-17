import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles
} from "discord.js";
import {
  finishGiveaway,
  giveawayComponents,
  giveawayEmbed
} from "../services/giveaways.js";
import { embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { extractId, parseDuration } from "../utils.js";
import { prefixArgs, slash } from "./helpers.js";
import type { Command } from "./types.js";
import {
  createGiveaway,
  getGiveaway,
  listGuildGiveaways
} from "../database/repositories/giveaways.js";
import { replyWithEmbed } from "./respond.js";

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
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("Show giveaway information")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("Giveaway message ID").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List active giveaways in this server")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(ctx) {
    const interaction = slash(ctx);
    const args = prefixArgs(ctx);
    const action = interaction?.options.getSubcommand() ?? args[0]?.toLowerCase();
    if (!["start", "end", "reroll", "info", "list"].includes(action ?? "")) {
      return ctx.reply(
        "Usage: `Xgiveaway start <duration> <winners> <prize>`, `end <messageID>`, `reroll <messageID>`, `info <messageID>`, or `list`.",
        true,
        "info"
      );
    }

    if (action === "info") {
      const rawId =
        interaction?.options.getString("message_id", true) ?? args[1];
      const messageId = rawId ? extractId(rawId) : null;
      if (!messageId) return ctx.reply("Provide a valid giveaway message ID.", true, "error");
      const giveaway = await getGiveaway(messageId);
      if (!giveaway || giveaway.guildId !== ctx.guild.id) {
        return ctx.reply("Giveaway not found in this server.", true, "error");
      }
      await replyWithEmbed(ctx, giveawayInfoEmbed(giveaway));
      return;
    }

    if (action === "list") {
      const giveaways = await listGuildGiveaways(ctx.guild.id);
      if (!giveaways.length) {
        return ctx.reply("No active giveaways are running in this server.", true, "info");
      }
      await replyWithEmbed(ctx, giveawayListEmbed(giveaways));
      return;
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

type GiveawayView = Awaited<ReturnType<typeof getGiveaway>> extends infer T
  ? NonNullable<T>
  : never;

function giveawayInfoEmbed(giveaway: GiveawayView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(
      [
        `## ${emojis.info} Giveaway Information`,
        `**Prize:** ${giveaway.prize}`,
        `**Message ID:** \`${giveaway.messageId}\``,
        `**Channel:** <#${giveaway.channelId}>`,
        `**Hosted By:** <@${giveaway.hostId}>`,
        `**Winners:** ${giveaway.winnerCount}`,
        `**Entries:** ${giveaway.entries.length}`,
        `**Status:** ${giveaway.ended ? "Ended" : "Active"}`,
        `**Ends:** ${time(giveaway.endsAt, TimestampStyles.RelativeTime)}`
      ].join("\n")
    );
}

function giveawayListEmbed(giveaways: GiveawayView[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(
      [
        `## ${emojis.info} Active Giveaways`,
        giveaways
          .map(
            (giveaway, index) =>
              `**${index + 1}. ${giveaway.prize}**\nMessage ID: \`${giveaway.messageId}\` | Channel: <#${giveaway.channelId}> | Ends ${time(giveaway.endsAt, TimestampStyles.RelativeTime)}`
          )
          .join("\n\n")
      ].join("\n")
    );
}
