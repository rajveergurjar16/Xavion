import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember
} from "discord.js";
import type { WarningActionDocument } from "../database/types.js";
import { embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { responseEmbed } from "../ui/embeds.js";
import {
  formatDuration,
  parseDuration,
  truncate
} from "../utils.js";
import {
  hierarchyError,
  prefixArgs,
  slash,
  targetMember,
  targetUser
} from "./helpers.js";
import type { Command, CommandContext } from "./types.js";
import {
  addWarning,
  clearWarningActions,
  countWarnings,
  getWarningAction,
  listWarningActions,
  listWarnings,
  removeWarning,
  removeWarningAction,
  setWarningAction
} from "../database/repositories/warnings.js";
import { sendModerationLog } from "../services/modlogs.js";
import { sendModerationDm } from "../services/moderation-notifications.js";

const warningsPerPage = 5;
const warningPagePrefix = "warnings:";

export const warnCommand: Command = {
  name: "warn",
  aliases: ["warning"],
  description: "Warn a member",
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  slash: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption((option) =>
      option.setName("user").setDescription("Member to warn").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true)
        .setMaxLength(512)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(ctx) {
    const member = await targetMember(ctx);
    if (!member) return ctx.reply("Member not found.", true, "error");
    if (member.user.bot) return ctx.reply("Bots cannot receive warnings.", true, "error");

    const hierarchy = hierarchyError(ctx.member, member, ctx.guild.members.me!);
    if (hierarchy) return ctx.reply(hierarchy, true, "error");

    const interaction = slash(ctx);
    const reason =
      interaction?.options.getString("reason", true) ??
      prefixArgs(ctx).slice(1).join(" ").trim();
    if (!reason) return ctx.reply("A warning reason is required.", true, "error");

    const warning = await addWarning({
      guildId: ctx.guild.id,
      userId: member.id,
      moderatorId: ctx.member.id,
      reason
    });
    const warningCount = await countWarnings(ctx.guild.id, member.id);
    const automaticAction = await runAutomaticAction(ctx, member, warningCount);

    const dmStatus = await sendModerationDm(member.user, {
      action: "Warned",
      guildName: ctx.guild.name,
      moderatorId: ctx.member.id,
      reason,
      details: `Warning ID: ${warning.warningId}\nTotal warnings: ${warningCount}${
        automaticAction ? `\nAutomatic action: ${automaticAction}` : ""
      }`
    });
    await sendModerationLog(ctx.guild, {
      action: "Warning Added",
      moderatorId: ctx.member.id,
      target: `<@${member.id}> (${member.id})`,
      reason,
      details: `Warning ID: ${warning.warningId}\nTotal warnings: ${warningCount}${
        automaticAction ? `\nAutomatic action: ${automaticAction}` : ""
      }`,
      dmStatus
    });

    await ctx.reply(
      `<@${member.id}> has been warned by <@${ctx.member.id}>.\n**Warning ID:** \`${warning.warningId}\`\n**Total warnings:** ${warningCount}\n**Reason:** ${reason}${
        automaticAction ? `\n**Automatic action:** ${automaticAction}` : ""
      }`,
      false,
      "success"
    );
  }
};

export const removeWarnCommand: Command = {
  name: "removewarn",
  aliases: ["delwarn", "rw"],
  description: "Remove a warning by ID",
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  slash: new SlashCommandBuilder()
    .setName("removewarn")
    .setDescription("Remove a warning by ID")
    .addIntegerOption((option) =>
      option
        .setName("warning_id")
        .setDescription("Warning ID to remove")
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(ctx) {
    const interaction = slash(ctx);
    const warningId =
      interaction?.options.getInteger("warning_id", true) ??
      Number(prefixArgs(ctx)[0]);
    if (!Number.isSafeInteger(warningId) || warningId < 1) {
      return ctx.reply("Provide a valid warning ID.", true, "error");
    }

    const warning = await removeWarning(ctx.guild.id, warningId);
    if (!warning) return ctx.reply("Warning not found.", true, "error");
    const user = await ctx.guild.client.users.fetch(warning.userId).catch(() => null);
    const dmStatus = user
      ? await sendModerationDm(user, {
          action: "Warning removed",
          guildName: ctx.guild.name,
          moderatorId: ctx.member.id,
          details: `Warning ID: ${warningId}`
        })
      : "failed";
    await sendModerationLog(ctx.guild, {
      action: "Warning Removed",
      moderatorId: ctx.member.id,
      target: `<@${warning.userId}> (${warning.userId})`,
      details: `Warning ID: ${warningId}`,
      dmStatus
    });
    await ctx.reply(
      `Warning \`#${warningId}\` has been removed from <@${warning.userId}> by <@${ctx.member.id}>.`,
      false,
      "success"
    );
  }
};

export const warningsCommand: Command = {
  name: "warnings",
  aliases: ["warns"],
  description: "View a user's warnings",
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  slash: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a user's warnings")
    .addUserOption((option) =>
      option.setName("user").setDescription("User whose warnings to view").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(ctx) {
    const user = await targetUser(ctx);
    if (!user) return ctx.reply("User not found.", true, "error");
    const total = await countWarnings(ctx.guild.id, user.id);
    if (total === 0) return ctx.reply(`<@${user.id}> has no warnings.`, true, "info");

    const payload = await warningPage(
      ctx.guild.id,
      user.id,
      user.tag,
      ctx.member.id,
      0
    );
    await ctx.replyPayload?.({ ...payload, flags: MessageFlags.Ephemeral }, true);
  }
};

export const warnConfigCommand: Command = {
  name: "warnconfig",
  aliases: ["wconfig"],
  description: "Manage automatic warning actions",
  userPermissions: [PermissionFlagsBits.ManageGuild],
  slash: new SlashCommandBuilder()
    .setName("warnconfig")
    .setDescription("Manage automatic warning actions")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Set an action for a warning count")
        .addIntegerOption((option) =>
          option
            .setName("count")
            .setDescription("Warning count that triggers the action")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to execute")
            .setRequired(true)
            .addChoices(
              { name: "Timeout", value: "timeout" },
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Required for timeout, for example 1h or 2d")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove the action at a warning count")
        .addIntegerOption((option) =>
          option
            .setName("count")
            .setDescription("Configured warning count")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List automatic warning actions")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("clear").setDescription("Remove all automatic warning actions")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(ctx) {
    const interaction = slash(ctx);
    const args = prefixArgs(ctx);
    const subcommand = interaction?.options.getSubcommand() ?? args[0]?.toLowerCase();

    if (subcommand === "list") return showWarningConfig(ctx);
    if (subcommand === "clear") {
      const deletedCount = await clearWarningActions(ctx.guild.id);
      await sendModerationLog(ctx.guild, {
        action: "Warning Configuration Cleared",
        moderatorId: ctx.member.id,
        details: `${deletedCount} automatic action(s) removed.`,
        dmStatus: "not_applicable"
      });
      return ctx.reply(
        `Cleared ${deletedCount} automatic warning action(s).`,
        true,
        "success"
      );
    }

    const count =
      interaction?.options.getInteger("count", true) ?? Number(args[1]);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      return ctx.reply("Warning count must be between 1 and 100.", true, "error");
    }

    if (subcommand === "remove") {
      const removed = await removeWarningAction(ctx.guild.id, count);
      if (removed) {
        await sendModerationLog(ctx.guild, {
          action: "Warning Configuration Removed",
          moderatorId: ctx.member.id,
          details: `Removed the automatic action at ${count} warning(s).`,
          dmStatus: "not_applicable"
        });
      }
      return ctx.reply(
        removed
          ? `Removed the automatic action at ${count} warning(s).`
          : `No automatic action is configured at ${count} warning(s).`,
        true,
        removed ? "success" : "error"
      );
    }

    if (subcommand !== "add") {
      return ctx.reply(
        "Usage: `Xwarnconfig add <count> <timeout|kick|ban> [duration]`, `remove <count>`, `list`, or `clear`.",
        true,
        "info"
      );
    }

    const action =
      interaction?.options.getString("action", true) ?? args[2]?.toLowerCase();
    if (!isWarningAction(action)) {
      return ctx.reply("Action must be `timeout`, `kick`, or `ban`.", true, "error");
    }

    const durationText =
      interaction?.options.getString("duration") ?? args[3] ?? null;
    const duration = durationText ? parseDuration(durationText) : null;
    const maximumTimeout = 28 * 24 * 60 * 60 * 1_000;
    if (action === "timeout" && (!duration || duration > maximumTimeout)) {
      return ctx.reply(
        "Timeout actions require a duration from `1s` to `28d`.",
        true,
        "error"
      );
    }

    await setWarningAction({
      guildId: ctx.guild.id,
      warningCount: count,
      action,
      durationMs: action === "timeout" ? duration : null
    });
    await sendModerationLog(ctx.guild, {
      action: "Warning Configuration Updated",
      moderatorId: ctx.member.id,
      details: `At ${count} warning(s): ${action}${
        action === "timeout" ? ` for ${formatDuration(duration!)}` : ""
      }.`,
      dmStatus: "not_applicable"
    });

    await ctx.reply(
      `At **${count} warning(s)**, Xavion will **${action}** the member${
        action === "timeout" ? ` for **${formatDuration(duration!)}**` : ""
      }.`,
      true,
      "success"
    );
  }
};

export const warningCommands: Command[] = [
  warnCommand,
  removeWarnCommand,
  warningsCommand,
  warnConfigCommand
];

export async function handleWarningButton(
  interaction: ButtonInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith(warningPagePrefix)) return false;
  if (!interaction.inCachedGuild()) return true;

  const [, requesterId, userId, rawPage] = interaction.customId.split(":");
  if (!requesterId || !userId || !rawPage || interaction.user.id !== requesterId) {
    await interaction.reply({
      embeds: [responseEmbed("Only the moderator who opened this list can use these buttons.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const page = Number(rawPage);
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user || !Number.isSafeInteger(page)) {
    await interaction.reply({
      embeds: [responseEmbed("This warning page is no longer available.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  await interaction.update(
    await warningPage(interaction.guild.id, user.id, user.tag, requesterId, page)
  );
  return true;
}

async function warningPage(
  guildId: string,
  userId: string,
  userTag: string,
  requesterId: string,
  requestedPage: number
) {
  const total = await countWarnings(guildId, userId);
  const pageCount = Math.max(1, Math.ceil(total / warningsPerPage));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const warningRecords = await listWarnings(
    guildId,
    userId,
    page,
    warningsPerPage
  );

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(
      `## ${emojis.info} Warnings for ${userTag}\n${warningRecords
        .map(
          (warning) =>
            `**#${warning.warningId}** | Moderator: <@${warning.moderatorId}>\n${truncate(warning.reason, 250)}`
        )
        .join("\n\n")}`
    )
    .setFooter({ text: `Page ${page + 1}/${pageCount} | ${total} warning(s)` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${warningPagePrefix}${requesterId}:${userId}:${page - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${warningPagePrefix}${requesterId}:${userId}:${page + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1)
  );

  return { embeds: [embed], components: [row] };
}

async function showWarningConfig(ctx: CommandContext): Promise<void> {
  const actions = await listWarningActions(ctx.guild.id);

  if (!actions.length) {
    return ctx.reply("No automatic warning actions are configured.", true, "info");
  }

  const lines = actions.map((entry) => {
    const duration =
      entry.action === "timeout" && entry.durationMs
        ? ` for ${formatDuration(entry.durationMs)}`
        : "";
    return `**${entry.warningCount} warning(s):** ${entry.action}${duration}`;
  });
  await ctx.reply(lines.join("\n"), true, "info");
}

async function runAutomaticAction(
  ctx: CommandContext,
  member: GuildMember,
  warningCount: number
): Promise<string | null> {
  const action = await getWarningAction(ctx.guild.id, warningCount);
  if (!action) return null;

  const reason = `Automatic action at ${warningCount} warnings`;
  try {
    if (action.action === "timeout") {
      if (!member.moderatable || !action.durationMs) return "Timeout failed: insufficient permissions";
      await member.timeout(action.durationMs, reason);
      return `Timed out for ${formatDuration(action.durationMs)}`;
    }
    if (action.action === "kick") {
      if (!member.kickable) return "Kick failed: insufficient permissions";
      await member.kick(reason);
      return "Kicked";
    }
    if (!member.bannable) return "Ban failed: insufficient permissions";
    await member.ban({ reason });
    return "Banned";
  } catch {
    return `${action.action} failed`;
  }
}

function isWarningAction(
  value: string | undefined
): value is WarningActionDocument["action"] {
  return value === "timeout" || value === "kick" || value === "ban";
}
