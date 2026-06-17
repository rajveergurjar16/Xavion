import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles
} from "discord.js";
import { embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { formatDuration } from "../utils.js";
import { targetUser } from "./helpers.js";
import { replyWithEmbed } from "./respond.js";
import type { Command } from "./types.js";

export const botInfoCommand: Command = {
  name: "botinfo",
  aliases: ["bi", "aboutbot"],
  description: "View Xavion runtime information",
  userPermissions: [PermissionFlagsBits.Administrator],
  slash: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("View Xavion runtime information")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(ctx) {
    const client = ctx.guild.client;
    const uptime = client.uptime ? formatDuration(client.uptime) : "Starting";
    const memory = formatBytes(process.memoryUsage().rss);
    const guilds = client.guilds.cache.size;
    const users = client.guilds.cache.reduce(
      (total, guild) => total + (guild.memberCount ?? 0),
      0
    );

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setThumbnail(client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setDescription(
        [
          `## ${emojis.info} Xavion Bot Info`,
          `**Bot:** ${client.user}`,
          `**Servers:** ${guilds}`,
          `**Cached Users:** ${users}`,
          `**Uptime:** ${uptime}`,
          `**Memory:** ${memory}`,
          `**Discord.js:** 14.26.4`,
          `**Node:** ${process.version}`
        ].join("\n")
      );
    await replyWithEmbed(ctx, embed, true);
  }
};

export const serverInfoCommand: Command = {
  name: "serverinfo",
  aliases: ["si", "guildinfo"],
  description: "View server information",
  slash: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View server information"),
  async execute(ctx) {
    const owner = await ctx.guild.fetchOwner().catch(() => null);
    const channels = ctx.guild.channels.cache;
    const createdAt = ctx.guild.createdAt;
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setThumbnail(ctx.guild.iconURL({ size: 256 }))
      .setDescription(
        [
          `## ${emojis.info} ${ctx.guild.name} Information`,
          "### Basic Details",
          `**Server Name :** ${ctx.guild.name}`,
          `**Server ID :** ${ctx.guild.id}`,
          `**Owner :** ${owner ? `<@${owner.id}> (${owner.id})` : "Unknown"}`,
          `**Members :** ${ctx.guild.memberCount}`,
          `**Roles :** ${ctx.guild.roles.cache.size}`,
          `**Emojis :** ${ctx.guild.emojis.cache.size}`,
          "",
          "### Server Statistics",
          `**Text Channels :** ${channels.filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum).size}`,
          `**Voice Channels :** ${channels.filter((channel) => channel.type === ChannelType.GuildVoice).size}`,
          `**Stage Channels :** ${channels.filter((channel) => channel.type === ChannelType.GuildStageVoice).size}`,
          `**Categories :** ${channels.filter((channel) => channel.type === ChannelType.GuildCategory).size}`,
          `**All Channels :** ${channels.size}`,
          `**Boosts :** ${ctx.guild.premiumSubscriptionCount ?? 0}`,
          "",
          "### Server Creation",
          `**Created :** ${time(createdAt, TimestampStyles.LongDateTime)}`,
          `**Age :** ${formatDuration(Date.now() - createdAt.getTime())}`
        ].join("\n")
      );
    await replyWithEmbed(ctx, embed);
  }
};

export const userInfoCommand: Command = {
  name: "userinfo",
  aliases: ["ui", "whois"],
  description: "View user information",
  userPermissions: [PermissionFlagsBits.Administrator],
  slash: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View user information")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to inspect").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(ctx) {
    const user = await targetUser(ctx);
    if (!user) return ctx.reply("User not found.", true, "error");
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    const joinedAt = member?.joinedAt ?? null;
    const createdAt = user.createdAt;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription(
        [
          `## ${emojis.info} User Info`,
          `**Username :** ${user.tag}`,
          `**Nickname :** ${member?.nickname ?? "None"}`,
          `**User ID :** ${user.id}`,
          `**Bot :** ${user.bot ? "Yes" : "No"}`,
          `**Joined Server :** ${joinedAt ? time(joinedAt, TimestampStyles.LongDateTime) : "Not in server"}`,
          `**Duration :** ${joinedAt ? formatDuration(Date.now() - joinedAt.getTime()) : "N/A"}`,
          `**Top Role :** ${member?.roles.highest.id === ctx.guild.id ? "None" : member?.roles.highest.toString() ?? "N/A"}`,
          `**Acc Created :** ${time(createdAt, TimestampStyles.LongDateTime)}`,
          `**Age :** ${formatDuration(Date.now() - createdAt.getTime())}`
        ].filter(Boolean).join("\n")
      );
    await replyWithEmbed(ctx, embed, true);
  }
};

export const avatarCommand: Command = {
  name: "avatar",
  aliases: ["av", "pfp"],
  description: "View a user's avatar",
  userPermissions: [PermissionFlagsBits.Administrator],
  slash: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("View a user's avatar")
    .addUserOption((option) =>
      option.setName("user").setDescription("User whose avatar to show")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(ctx) {
    const user = await targetUser(ctx).catch(() => null) ?? ctx.member.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setDescription(`## ${emojis.info} Avatar\n**User:** <@${user.id}>\n[Open Avatar](${url})`)
      .setImage(url);
    await replyWithEmbed(ctx, embed, true);
  }
};

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export const informationCommands: Command[] = [
  botInfoCommand,
  serverInfoCommand,
  userInfoCommand,
  avatarCommand
];
