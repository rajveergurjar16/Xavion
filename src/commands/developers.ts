import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} from "discord.js";
import { config, embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { responseEmbed } from "../ui/embeds.js";
import { extractId } from "../utils.js";
import {
  addNoPrefixUser,
  countNoPrefixUsers,
  listNoPrefixUsers,
  removeNoPrefixUser
} from "../database/repositories/no-prefix.js";
import { prefixArgs, slash } from "./helpers.js";
import type { Command } from "./types.js";

const usersPerPage = 10;
const pagePrefix = "npusers:";

export const npAddCommand: Command = {
  name: "npadd",
  aliases: ["npa"],
  description: "Add a global no-prefix user",
  developerOnly: true,
  slash: new SlashCommandBuilder()
    .setName("npadd")
    .setDescription("Add a global no-prefix user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to add").setRequired(true)
    ),
  async execute(ctx) {
    const interaction = slash(ctx);
    const userId =
      interaction?.options.getUser("user", true).id ??
      extractId(prefixArgs(ctx)[0] ?? "");
    if (!userId) {
      return ctx.reply("Mention a user or provide a valid user ID.", true, "error");
    }
    const user = await ctx.guild.client.users.fetch(userId).catch(() => null);
    if (!user) return ctx.reply("Discord user not found.", true, "error");

    const added = await addNoPrefixUser({
      userId,
      addedBy: ctx.member.id,
      addedAt: new Date()
    });
    if (!added) {
      return ctx.reply(`<@${userId}> already has global no-prefix access.`, true, "info");
    }
    await ctx.reply(
      `<@${userId}> can now use Xavion commands without a prefix in every server.`,
      false,
      "success"
    );
  }
};

export const npRemoveCommand: Command = {
  name: "nprem",
  aliases: ["npr", "npremove"],
  description: "Remove a global no-prefix user",
  developerOnly: true,
  slash: new SlashCommandBuilder()
    .setName("nprem")
    .setDescription("Remove a global no-prefix user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to remove").setRequired(true)
    ),
  async execute(ctx) {
    const interaction = slash(ctx);
    const userId =
      interaction?.options.getUser("user", true).id ??
      extractId(prefixArgs(ctx)[0] ?? "");
    if (!userId) {
      return ctx.reply("Mention a user or provide a valid user ID.", true, "error");
    }
    const removed = await removeNoPrefixUser(userId);
    await ctx.reply(
      removed
        ? `<@${userId}>'s global no-prefix access has been removed.`
        : `<@${userId}> does not have global no-prefix access.`,
      true,
      removed ? "success" : "info"
    );
  }
};

export const npUsersCommand: Command = {
  name: "npusers",
  aliases: ["nplist"],
  description: "List global no-prefix users",
  developerOnly: true,
  slash: new SlashCommandBuilder()
    .setName("npusers")
    .setDescription("List global no-prefix users"),
  async execute(ctx) {
    const payload = await noPrefixPage(ctx.member.id, 0);
    if (ctx.source.kind === "slash") {
      await ctx.source.interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral
      });
    } else {
      await ctx.source.message.reply(payload);
    }
  }
};

export const developerCommands: Command[] = [
  npAddCommand,
  npRemoveCommand,
  npUsersCommand
];

export async function handleNoPrefixButton(
  interaction: ButtonInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith(pagePrefix)) return false;
  const [, requesterId, rawPage] = interaction.customId.split(":");
  if (
    !requesterId ||
    interaction.user.id !== requesterId ||
    !config.DEVELOPER_IDS.includes(interaction.user.id)
  ) {
    await interaction.reply({
      embeds: [responseEmbed("Only the developer who opened this list can use these buttons.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const page = Number(rawPage);
  if (!Number.isSafeInteger(page)) {
    await interaction.reply({
      embeds: [responseEmbed("This no-prefix page is invalid.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  await interaction.update(await noPrefixPage(requesterId, page));
  return true;
}

async function noPrefixPage(requesterId: string, requestedPage: number) {
  const total = await countNoPrefixUsers();
  const pageCount = Math.max(1, Math.ceil(total / usersPerPage));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const users = await listNoPrefixUsers(page, usersPerPage);

  const description = users.length
    ? users
        .map(
          (entry, index) =>
            `**${page * usersPerPage + index + 1}.** <@${entry.userId}> (\`${entry.userId}\`)\n-# Added by <@${entry.addedBy}>`
        )
        .join("\n")
    : "No global no-prefix users have been added.";
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(`## ${emojis.info} Global No-Prefix Users\n${description}`)
    .setFooter({
      text: `Page ${page + 1}/${pageCount} | ${total} user(s)`
    });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${pagePrefix}${requesterId}:${page - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${pagePrefix}${requesterId}:${page + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1)
  );
  return { embeds: [embed], components: [row] };
}
