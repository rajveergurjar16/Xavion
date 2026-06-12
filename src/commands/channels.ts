import {
  ChannelType,
  type GuildChannel,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";
import type { Command, CommandContext } from "./types.js";
import { prefixArgs, slash } from "./helpers.js";
import { extractId } from "../utils.js";
import { sendModerationLog } from "../services/modlogs.js";

type ChannelAction = "lock" | "unlock" | "hide" | "unhide";

function createChannelCommand(action: ChannelAction): Command {
  const descriptions: Record<ChannelAction, string> = {
    lock: "Stop members from sending messages in a channel",
    unlock: "Allow members to send messages in a channel",
    hide: "Hide a channel from members",
    unhide: "Make a channel visible to members"
  };

  return {
    name: action,
    aliases: channelAliases[action],
    description: descriptions[action],
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    slash: new SlashCommandBuilder()
      .setName(action)
      .setDescription(descriptions[action])
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to update; defaults to the current channel")
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildForum,
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(ctx) {
      const channel = getChannel(ctx);
      if (!channel) {
        return ctx.reply("Provide a valid text, forum, voice, or stage channel.", true, "error");
      }
      const everyone = ctx.guild.roles.everyone;
      const permission =
        action === "hide" || action === "unhide"
          ? PermissionFlagsBits.ViewChannel
          : channel.isVoiceBased()
            ? PermissionFlagsBits.Connect
            : PermissionFlagsBits.SendMessages;
      const currentlyAllowed = channel.permissionsFor(everyone).has(permission);
      const shouldAllow = action === "unlock" || action === "unhide";
      const state = actionState(action);

      if (currentlyAllowed === shouldAllow) {
        return ctx.reply(
          `<#${channel.id}> is already ${state}.`,
          true,
          "info"
        );
      }
      const overwrite =
        permission === PermissionFlagsBits.Connect
          ? { Connect: shouldAllow }
          : permission === PermissionFlagsBits.SendMessages
            ? { SendMessages: shouldAllow }
            : { ViewChannel: shouldAllow };

      await channel.permissionOverwrites.edit(
        everyone,
        overwrite,
        { reason: `${action} by ${ctx.member.user.tag}` }
      );
      await sendModerationLog(ctx.guild, {
        action: `Channel ${state[0]?.toUpperCase()}${state.slice(1)}`,
        moderatorId: ctx.member.id,
        target: `<#${channel.id}> (${channel.id})`,
        details: `Updated ${permissionName(permission)} for @everyone.`,
        dmStatus: "not_applicable"
      });
      await ctx.reply(
        `<#${channel.id}> has been ${state} by <@${ctx.member.id}>.`,
        false,
        "success"
      );
    }
  };
}

const channelAliases: Record<ChannelAction, string[]> = {
  lock: ["lockchannel"],
  unlock: ["unlockchannel"],
  hide: ["hidechannel"],
  unhide: ["unhidechannel"]
};

type OverwriteChannel = Exclude<
  GuildChannel,
  { type: ChannelType.GuildCategory | ChannelType.GuildDirectory }
>;

function getChannel(ctx: CommandContext): OverwriteChannel | null {
  const interaction = slash(ctx);
  if (interaction) {
    const selected = interaction.options.getChannel("channel");
    if (!selected) {
      return isSupportedChannel(ctx.channel)
        ? (ctx.channel as OverwriteChannel)
        : null;
    }
    return isSupportedChannel(selected)
      ? (selected as OverwriteChannel)
      : null;
  }
  const rawChannel = prefixArgs(ctx)[0];
  if (!rawChannel) {
    return isSupportedChannel(ctx.channel)
      ? (ctx.channel as OverwriteChannel)
      : null;
  }
  const channelId = extractId(rawChannel);
  const channel = channelId ? ctx.guild.channels.cache.get(channelId) : null;
  return channel && isSupportedChannel(channel)
    ? (channel as OverwriteChannel)
    : null;
}

function isSupportedChannel(
  channel: GuildChannel | CommandContext["channel"]
): channel is OverwriteChannel {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
  ].includes(channel.type);
}

function actionState(action: ChannelAction): string {
  if (action === "lock") return "locked";
  if (action === "unlock") return "unlocked";
  if (action === "hide") return "hidden";
  return "unhidden";
}

function permissionName(permission: bigint): string {
  if (permission === PermissionFlagsBits.Connect) return "Connect";
  if (permission === PermissionFlagsBits.SendMessages) return "Send Messages";
  return "View Channel";
}

export const channelCommands: Command[] = [
  createChannelCommand("lock"),
  createChannelCommand("unlock"),
  createChannelCommand("hide"),
  createChannelCommand("unhide")
];
