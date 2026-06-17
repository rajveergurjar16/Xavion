import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  Message,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} from "discord.js";
import { buildHelpPayload } from "../commands/help.js";
import { config, embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { responseEmbed } from "../ui/embeds.js";

const invitePermissions = "1374525156374";
const helpButtonPrefix = "mention-help:";

export async function handleExactBotMention(
  message: Message<true>
): Promise<boolean> {
  const botId = message.client.user.id;
  const content = message.content.trim();
  const exactMention = content === `<@${botId}>` || content === `<@!${botId}>`;
  if (
    !exactMention ||
    message.mentions.users.size !== 1 ||
    !message.mentions.users.has(botId) ||
    message.mentions.roles.size > 0 ||
    message.mentions.everyone ||
    message.attachments.size > 0 ||
    message.stickers.size > 0
  ) {
    return false;
  }

  const container = new ContainerBuilder()
    .setAccentColor(embedColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### <a:Xavion_Hello:1514900308873052171> Hey ${message.author}!`,
          `-# Myself [Xavion](${botInviteUrl()}),`,
          "-# Your one & only best multipurpose Discord bot.",
          `-# My prefix is \`${config.PREFIX}\`. Use \`${config.PREFIX}help\``,
          "-# or press the Help button below."
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${helpButtonPrefix}${message.author.id}`)
          .setLabel("Help")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel("Support")
          .setStyle(ButtonStyle.Link)
          .setURL(config.SUPPORT_SERVER_URL),
        new ButtonBuilder()
          .setLabel("Invite Bot")
          .setStyle(ButtonStyle.Link)
          .setURL(botInviteUrl())
      )
    );

  await message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false }
  });
  return true;
}

export async function handleMentionHelpButton(
  interaction: ButtonInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith(helpButtonPrefix)) return false;
  const requesterId = interaction.customId.slice(helpButtonPrefix.length);
  if (interaction.user.id !== requesterId) {
    await interaction.reply({
      embeds: [responseEmbed("This help button belongs to another user.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  await interaction.reply({
    ...buildHelpPayload(requesterId, "home", interaction.client, interaction.user),
    flags: MessageFlags.Ephemeral
  });
  return true;
}

export function botInviteUrl(): string {
  return (
    config.BOT_INVITE_URL ??
    `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&permissions=${invitePermissions}&scope=bot%20applications.commands`
  );
}
