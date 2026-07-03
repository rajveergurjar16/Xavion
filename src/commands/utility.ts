import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
  type Role
} from "discord.js";
import { setAfkUser } from "../database/repositories/afk.js";
import { config } from "../config.js";
import { extractId, formatDuration, parseDuration, truncate } from "../utils.js";
import { hierarchyError, prefixArgs, slash, targetMember, textOption } from "./helpers.js";
import type { Command, CommandContext } from "./types.js";

export const afkCommand: Command = {
  name: "afk",
  aliases: ["away"],
  description: "Set a global AFK status",
  slash: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set a global AFK status")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason shown when someone mentions you")
        .setMaxLength(300)
    ),
  async execute(ctx) {
    const reason = textOption(ctx, "reason", 0) ?? "AFK";
    await setAfkUser({
      userId: ctx.member.id,
      reason,
      setAt: new Date()
    });
    await ctx.reply(
      `<@${ctx.member.id}> is now AFK.\n**Reason:** ${truncate(reason, 300)}`,
      false,
      "success"
    );
  }
};

export const sayCommand: Command = {
  name: "say",
  aliases: ["announce"],
  description: "Send a message as Xavion",
  userPermissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  slash: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as Xavion")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Message to send")
        .setRequired(true)
        .setMaxLength(1_500)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send in; defaults to current channel")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(ctx) {
    const parsed = parseSayInput(ctx);
    if (!parsed?.message) {
      return ctx.reply("Usage: `Xsay <message> [#channel]`.", true, "error");
    }

    await parsed.channel.send({ content: parsed.message });
    await ctx.reply(`Message sent in <#${parsed.channel.id}>.`, true, "success");
  }
};

export const slowmodeCommand: Command = {
  name: "slowmode",
  aliases: ["slow"],
  description: "Set channel slowmode",
  userPermissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  slash: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration such as 5s, 2m, or off")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to update; defaults to current channel")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(ctx) {
    const parsed = parseSlowmodeInput(ctx);
    if (!parsed) {
      return ctx.reply("Usage: `Xslowmode <duration|off> [#channel]`.", true, "error");
    }
    if (!canSetSlowmode(parsed.channel)) {
      return ctx.reply("Slowmode can only be set in text or announcement channels.", true, "error");
    }

    await parsed.channel.setRateLimitPerUser(parsed.seconds, `Slowmode changed by ${ctx.member.user.tag}`);
    await ctx.reply(
      parsed.seconds === 0
        ? `Slowmode has been disabled in <#${parsed.channel.id}> by <@${ctx.member.id}>.`
        : `Slowmode in <#${parsed.channel.id}> is now **${formatDuration(parsed.seconds * 1_000)}** by <@${ctx.member.id}>.`,
      false,
      "success"
    );
  }
};

export const roleCommand: Command = {
  name: "role",
  aliases: ["roles"],
  description: "Add or remove a role from a member",
  userPermissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],
  slash: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a member")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a role to a member")
        .addUserOption((option) =>
          option.setName("user").setDescription("Member").setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to add").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a role from a member")
        .addUserOption((option) =>
          option.setName("user").setDescription("Member").setRequired(true)
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to remove").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(ctx) {
    const interaction = slash(ctx);
    const action = interaction?.options.getSubcommand() ?? prefixArgs(ctx)[0]?.toLowerCase();
    if (action !== "add" && action !== "remove") {
      return ctx.reply("Usage: `Xrole add @user @role` or `Xrole remove @user @role`.", true, "info");
    }

    const member = await targetMember(ctx, "user", 1);
    const role = interaction?.options.getRole("role") ?? resolveRole(ctx, prefixArgs(ctx)[2]);
    if (!member || !role) return ctx.reply("Provide a valid member and role.", true, "error");
    const error = hierarchyError(ctx.member, member, ctx.guild.members.me!);
    if (error) return ctx.reply(error, true, "error");
    const roleError = roleManageError(ctx, role);
    if (roleError) return ctx.reply(roleError, true, "error");

    if (action === "add") {
      if (member.roles.cache.has(role.id)) {
        return ctx.reply(`<@${member.id}> already has <@&${role.id}>.`, true, "info");
      }
      await member.roles.add(role, `Role added by ${ctx.member.user.tag}`);
      return ctx.reply(`<@&${role.id}> has been added to <@${member.id}> by <@${ctx.member.id}>.`, false, "success");
    }

    if (!member.roles.cache.has(role.id)) {
      return ctx.reply(`<@${member.id}> does not have <@&${role.id}>.`, true, "info");
    }
    await member.roles.remove(role, `Role removed by ${ctx.member.user.tag}`);
    return ctx.reply(`<@&${role.id}> has been removed from <@${member.id}> by <@${ctx.member.id}>.`, false, "success");
  }
};

/**
 * Returns the raw text typed after the command name (prefix + "say"/"announce"),
 * preserving multiple spaces and newlines exactly as the user typed them.
 * Returns null for slash commands or an empty string if nothing follows the command name.
 */
function rawCommandBody(ctx: CommandContext): string | null {
  if (ctx.source.kind !== "prefix") return null;
  const content = ctx.source.message.content;
  const hasPrefix = content.toLowerCase().startsWith(config.PREFIX.toLowerCase());
  const body = hasPrefix ? content.slice(config.PREFIX.length) : content;
  const trimmedBody = body.replace(/^\s+/, "");
  const spaceIdx = trimmedBody.search(/\s/);
  if (spaceIdx === -1) return "";
  return trimmedBody.slice(spaceIdx + 1);
}

function parseSayInput(
  ctx: CommandContext
): { message: string; channel: GuildTextBasedChannel } | null {
  const interaction = slash(ctx);
  if (interaction) {
    const selected = interaction.options.getChannel("channel");
    return {
      message: interaction.options.getString("message", true),
      channel: selected?.isTextBased() && !selected.isDMBased()
        ? selected
        : ctx.channel
    };
  }

  const raw = rawCommandBody(ctx);
  if (!raw) return null;

  let message = raw;
  let channel: GuildTextBasedChannel = ctx.channel;

  const channelMatch = raw.match(/<#(\d+)>\s*$/);
  if (channelMatch && typeof channelMatch.index === "number") {
    const resolved = resolveOptionalTextChannel(ctx, channelMatch[0]);
    if (resolved) {
      channel = resolved;
      message = raw.slice(0, channelMatch.index);
    }
  }

  message = message.trim();
  return message ? { message, channel } : null;
}

function parseSlowmodeInput(
  ctx: CommandContext
): { seconds: number; channel: GuildTextBasedChannel } | null {
  const interaction = slash(ctx);
  if (interaction) {
    const rawDuration = interaction.options.getString("duration", true);
    const selected = interaction.options.getChannel("channel");
    const channel = selected?.isTextBased() && !selected.isDMBased()
      ? selected
      : ctx.channel;
    const seconds = parseSlowmode(rawDuration);
    return seconds === null ? null : { seconds, channel };
  }

  const args = prefixArgs(ctx);
  const firstChannel = args[0] ? resolveOptionalTextChannel(ctx, args[0]) : null;
  const channelFirst = Boolean(firstChannel);
  const secondChannel = args[1] ? resolveOptionalTextChannel(ctx, args[1]) : null;
  const channel = firstChannel ?? secondChannel ?? ctx.channel;
  const duration = channelFirst ? args[1] : args[0];
  const seconds = duration ? parseSlowmode(duration) : null;
  return seconds === null ? null : { seconds, channel };
}

function parseSlowmode(value: string): number | null {
  if (["off", "none", "0", "disable"].includes(value.toLowerCase())) return 0;
  const duration = parseDuration(value);
  if (!duration) return null;
  const seconds = Math.ceil(duration / 1_000);
  return seconds >= 0 && seconds <= 21_600 ? seconds : null;
}

function canSetSlowmode(
  channel: GuildTextBasedChannel
): channel is GuildTextBasedChannel & { setRateLimitPerUser(seconds: number, reason?: string): Promise<unknown> } {
  return "setRateLimitPerUser" in channel;
}

function resolveRole(ctx: CommandContext, value: string | undefined): Role | null {
  const id = value ? extractId(value) : null;
  return id ? ctx.guild.roles.cache.get(id) ?? null : null;
}

function resolveOptionalTextChannel(
  ctx: CommandContext,
  value: string
): GuildTextBasedChannel | null {
  const id = extractId(value);
  if (!id) return null;
  const channel = ctx.guild.channels.cache.get(id);
  return channel?.isTextBased() && !channel.isDMBased()
    ? channel
    : null;
}

function roleManageError(ctx: CommandContext, role: Role): string | null {
  if (role.id === ctx.guild.id) return "The everyone role cannot be managed.";
  if (role.managed) return "That role is managed by an integration.";
  if (
    ctx.member.id !== ctx.guild.ownerId &&
    ctx.member.roles.highest.comparePositionTo(role) <= 0
  ) {
    return "Your highest role must be above that role.";
  }
  const bot = ctx.guild.members.me;
  if (!bot || bot.roles.highest.comparePositionTo(role) <= 0) {
    return "My highest role must be above that role.";
  }
  return null;
}

export const utilityCommands: Command[] = [
  afkCommand,
  sayCommand,
  slowmodeCommand,
  roleCommand
];