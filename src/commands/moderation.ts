import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder
} from "discord.js";
import type { Command } from "./types.js";
import {
  defaultModerationPermissions,
  hierarchyError,
  prefixArgs,
  slash,
  targetMember,
  targetUser,
  textOption
} from "./helpers.js";
import { extractId, formatDuration, parseDuration } from "../utils.js";
import {
  addNicknameChannel,
  listNicknameChannels,
  removeNicknameChannel
} from "../database/repositories/nickname-channels.js";
import { sendModerationLog } from "../services/modlogs.js";
import { sendModerationDm } from "../services/moderation-notifications.js";

const reasonOption = (builder: SlashCommandOptionsOnlyBuilder) =>
  builder.addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason recorded in the audit log")
      .setMaxLength(512)
  );

export const nicknameCommand: Command = {
  name: "nickname",
  aliases: ["nick"],
  description: "Change a member's nickname",
  userPermissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],
  slash: new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Manage member nicknames and nickname channels")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("member")
        .setDescription("Change or reset a member's nickname")
        .addUserOption((option) =>
          option.setName("user").setDescription("Member to rename").setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("nickname")
            .setDescription("New nickname; omit to reset")
            .setMaxLength(32)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("channel")
        .setDescription("Manage automatic nickname channels")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("set")
            .setDescription("Add a nickname channel")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Channel where messages set nicknames")
                .setRequired(true)
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                  ChannelType.GuildVoice,
                  ChannelType.GuildStageVoice
                )
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a nickname channel")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("Configured nickname channel")
                .setRequired(true)
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                  ChannelType.GuildVoice,
                  ChannelType.GuildStageVoice
                )
            )
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("list").setDescription("List nickname channels")
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  async execute(ctx) {
    const interaction = slash(ctx);
    const args = prefixArgs(ctx);
    const channelMode =
      interaction?.options.getSubcommandGroup(false) === "channel" ||
      args[0]?.toLowerCase() === "channel";

    if (channelMode) {
      const action =
        interaction?.options.getSubcommand() ?? args[1]?.toLowerCase();
      if (action === "list") {
        const channels = await listNicknameChannels(ctx.guild.id);
        if (!channels.length) {
          return ctx.reply("No nickname channels are configured.", true, "info");
        }
        return ctx.reply(
          channels.map((entry, index) => `${index + 1}. <#${entry.channelId}>`).join("\n"),
          true,
          "info"
        );
      }

      if (action !== "set" && action !== "remove") {
        return ctx.reply(
          "Usage: `Xnickname channel set #channel`, `remove #channel`, or `list`.",
          true,
          "info"
        );
      }

      const selected = interaction?.options.getChannel("channel");
      const rawChannel = args[2];
      const channelId = selected?.id ?? (rawChannel ? extractId(rawChannel) : null);
      const channel = channelId ? ctx.guild.channels.cache.get(channelId) : null;
      const supportedTypes: ChannelType[] = [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice
      ];
      if (!channel || !supportedTypes.includes(channel.type)) {
        return ctx.reply(
          "Provide a valid text, announcement, voice, or stage channel.",
          true,
          "error"
        );
      }

      if (action === "set") {
        const added = await addNicknameChannel({
          guildId: ctx.guild.id,
          channelId: channel.id,
          createdBy: ctx.member.id,
          createdAt: new Date()
        });
        if (!added) {
          return ctx.reply(`<#${channel.id}> is already a nickname channel.`, true, "info");
        }
        await sendModerationLog(ctx.guild, {
          action: "Nickname Channel Added",
          moderatorId: ctx.member.id,
          target: `<#${channel.id}>`,
          details: "Messages in this channel can change a member's nickname.",
          dmStatus: "not_applicable"
        });
        return ctx.reply(
          `<#${channel.id}> has been set as a nickname channel by <@${ctx.member.id}>.\nMembers can send plain text to change their nickname and type \`reset\` to reset it.`,
          false,
          "success"
        );
      }

      const removed = await removeNicknameChannel(ctx.guild.id, channel.id);
      if (removed) {
        await sendModerationLog(ctx.guild, {
          action: "Nickname Channel Removed",
          moderatorId: ctx.member.id,
          target: `<#${channel.id}>`,
          dmStatus: "not_applicable"
        });
      }
      return ctx.reply(
        removed
          ? `<#${channel.id}> has been removed from nickname channels by <@${ctx.member.id}>.`
          : `<#${channel.id}> is not a configured nickname channel.`,
        true,
        removed ? "success" : "error"
      );
    }

    const member = await targetMember(ctx);
    if (!member) return ctx.reply("Member not found. Mention a server member or use their ID.", true, "error");
    const error = hierarchyError(ctx.member, member, ctx.guild.members.me!);
    if (error) return ctx.reply(error, true, "error");

    const nickname =
      interaction?.options.getString("nickname") ??
      args.slice(1).join(" ").trim() ??
      null;
    await member.setNickname(nickname || null, `Changed by ${ctx.member.user.tag}`);
    const dmStatus = await sendModerationDm(member.user, {
      action: nickname ? "Nickname changed" : "Nickname reset",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      ...(nickname ? { details: `New nickname: ${nickname}` } : {})
    });
    await sendModerationLog(ctx.guild, {
      action: nickname ? "Nickname Changed" : "Nickname Reset",
      moderatorId: ctx.member.id,
      target: `<@${member.id}> (${member.id})`,
      ...(nickname ? { details: `New nickname: ${nickname}` } : {}),
      dmStatus
    });
    await ctx.reply(
      nickname
        ? `<@${member.id}>'s nickname has been changed to **${nickname}** by <@${ctx.member.id}>.`
        : `<@${member.id}>'s nickname has been reset by <@${ctx.member.id}>.`,
      true,
      "success"
    );
  }
};

export const banCommand: Command = {
  name: "ban",
  aliases: ["banuser"],
  description: "Ban a user from the server",
  userPermissions: [defaultModerationPermissions.ban],
  botPermissions: [defaultModerationPermissions.ban],
  slash: reasonOption(
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a user from the server")
      .addUserOption((option) =>
        option.setName("user").setDescription("User to ban").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  ),
  async execute(ctx) {
    const user = await targetUser(ctx);
    if (!user) return ctx.reply("User not found. Mention a user or provide their ID.", true, "error");
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const error = hierarchyError(ctx.member, member, ctx.guild.members.me!);
      if (error) return ctx.reply(error, true, "error");
      if (!member.bannable) return ctx.reply("I cannot ban that member.", true, "error");
    }
    const reason = textOption(ctx, "reason", 1) ?? `Banned by ${ctx.member.user.tag}`;
    await ctx.guild.members.ban(user.id, { reason });
    const dmStatus = await sendModerationDm(user, {
      action: "Banned",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      reason
    });
    await sendModerationLog(ctx.guild, {
      action: "Ban",
      moderatorId: ctx.member.id,
      target: `<@${user.id}> (${user.id})`,
      reason,
      dmStatus
    });
    await ctx.reply(
      `<@${user.id}> has been banned by <@${ctx.member.id}>.\n**Reason:** ${reason}`,
      false,
      "success"
    );
  }
};

export const unbanCommand: Command = {
  name: "unban",
  aliases: ["ub"],
  description: "Remove a user's ban",
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  slash: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Remove a user's ban")
    .addStringOption((option) =>
      option.setName("user_id").setDescription("ID of the banned user").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for unbanning").setMaxLength(512)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(ctx) {
    const interaction = slash(ctx);
    const rawId = interaction
      ? interaction.options.getString("user_id", true)
      : prefixArgs(ctx)[0];
    const userId = rawId ? extractId(rawId) : null;
    if (!userId) return ctx.reply("Provide a valid Discord user ID.", true, "error");
    const reason =
      (interaction
        ? interaction.options.getString("reason")
        : prefixArgs(ctx).slice(1).join(" ").trim()) ||
      `Unbanned by ${ctx.member.user.tag}`;
    const ban = await ctx.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return ctx.reply("That user is not banned.", true, "error");
    await ctx.guild.members.unban(userId, reason);
    const dmStatus = await sendModerationDm(ban.user, {
      action: "Unbanned",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      reason
    });
    await sendModerationLog(ctx.guild, {
      action: "Unban",
      moderatorId: ctx.member.id,
      target: `<@${ban.user.id}> (${ban.user.id})`,
      reason,
      dmStatus
    });
    await ctx.reply(
      `<@${ban.user.id}> has been unbanned by <@${ctx.member.id}>.`,
      false,
      "success"
    );
  }
};

export const kickCommand: Command = {
  name: "kick",
  aliases: ["kickuser"],
  description: "Kick a member from the server",
  userPermissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],
  slash: reasonOption(
    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member from the server")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to kick").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  ),
  async execute(ctx) {
    const member = await targetMember(ctx);
    if (!member) return ctx.reply("Member not found.", true, "error");
    const error = hierarchyError(ctx.member, member, ctx.guild.members.me!);
    if (error) return ctx.reply(error, true, "error");
    if (!member.kickable) return ctx.reply("I cannot kick that member.", true, "error");
    const reason = textOption(ctx, "reason", 1) ?? `Kicked by ${ctx.member.user.tag}`;
    const memberId = member.id;
    const user = member.user;
    await member.kick(reason);
    const dmStatus = await sendModerationDm(user, {
      action: "Kicked",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      reason
    });
    await sendModerationLog(ctx.guild, {
      action: "Kick",
      moderatorId: ctx.member.id,
      target: `<@${memberId}> (${memberId})`,
      reason,
      dmStatus
    });
    await ctx.reply(
      `<@${memberId}> has been kicked by <@${ctx.member.id}>.\n**Reason:** ${reason}`,
      false,
      "success"
    );
  }
};

export const timeoutCommand: Command = {
  name: "timeout",
  aliases: ["mute"],
  description: "Temporarily timeout a member",
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  slash: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily timeout a member")
    .addUserOption((option) =>
      option.setName("user").setDescription("Member to timeout").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration such as 30m, 2h, or 1d12h")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the timeout").setMaxLength(512)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(ctx) {
    const member = await targetMember(ctx);
    if (!member) return ctx.reply("Member not found.", true, "error");
    const error = hierarchyError(ctx.member, member, ctx.guild.members.me!);
    if (error) return ctx.reply(error, true, "error");

    const interaction = slash(ctx);
    const durationText = interaction
      ? interaction.options.getString("duration", true)
      : prefixArgs(ctx)[1];
    const duration = durationText ? parseDuration(durationText) : null;
    const maximum = 28 * 24 * 60 * 60 * 1_000;
    if (!duration || duration > maximum) {
      return ctx.reply("Use a duration from `1s` to `28d`, for example `2h30m`.", true, "error");
    }
    if (!member.moderatable) return ctx.reply("I cannot timeout that member.", true, "error");
    const requestedExpiry = Date.now() + duration;
    const currentExpiry = member.communicationDisabledUntilTimestamp;
    const isTimedOut = member.isCommunicationDisabled() && currentExpiry !== null;
    if (isTimedOut && requestedExpiry <= currentExpiry) {
      const remainingTimeout = formatDuration(currentExpiry - Date.now());
      return ctx.reply(
        `<@${member.id}> is already timed out for **${remainingTimeout}**.`,
        true,
        "info"
      );
    }
    const reason =
      (interaction
        ? interaction.options.getString("reason")
        : prefixArgs(ctx).slice(2).join(" ").trim()) ||
      `Timed out by ${ctx.member.user.tag}`;
    await member.timeout(duration, reason);
    const action = isTimedOut ? "Timeout Extended" : "Timeout";
    const dmStatus = await sendModerationDm(member.user, {
      action: isTimedOut ? "Timeout extended" : "Timed out",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      reason,
      details: `Duration: ${formatDuration(duration)}`
    });
    await sendModerationLog(ctx.guild, {
      action,
      moderatorId: ctx.member.id,
      target: `<@${member.id}> (${member.id})`,
      reason,
      details: `Duration: ${formatDuration(duration)}`,
      dmStatus
    });
    await ctx.reply(
      isTimedOut
        ? `<@${member.id}>'s timeout has been extended for **${durationText}** by <@${ctx.member.id}>.\n**Reason:** ${reason}`
        : `<@${member.id}> has been timed out for **${durationText}** by <@${ctx.member.id}>.\n**Reason:** ${reason}`,
      false,
      "success"
    );
  }
};

export const untimeoutCommand: Command = {
  name: "untimeout",
  aliases: ["unmute"],
  description: "Remove a member's timeout",
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  slash: reasonOption(
    new SlashCommandBuilder()
      .setName("untimeout")
      .setDescription("Remove a member's timeout")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member whose timeout to remove").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  ),
  async execute(ctx) {
    const member = await targetMember(ctx);
    if (!member) return ctx.reply("Member not found.", true, "error");
    const error = hierarchyError(ctx.member, member, ctx.guild.members.me!);
    if (error) return ctx.reply(error, true, "error");
    if (!member.isCommunicationDisabled()) {
      return ctx.reply("That member is not timed out.", true, "error");
    }
    const reason = textOption(ctx, "reason", 1) ?? `Timeout removed by ${ctx.member.user.tag}`;
    await member.timeout(null, reason);
    const dmStatus = await sendModerationDm(member.user, {
      action: "Timeout removed",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      reason
    });
    await sendModerationLog(ctx.guild, {
      action: "Timeout Removed",
      moderatorId: ctx.member.id,
      target: `<@${member.id}> (${member.id})`,
      reason,
      dmStatus
    });
    await ctx.reply(
      `<@${member.id}>'s timeout has been removed by <@${ctx.member.id}>.`,
      false,
      "success"
    );
  }
};

export const moderationCommands: Command[] = [
  nicknameCommand,
  banCommand,
  unbanCommand,
  kickCommand,
  timeoutCommand,
  untimeoutCommand
];
