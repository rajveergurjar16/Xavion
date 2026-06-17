import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type Message,
  type PartialMessage
} from "discord.js";
import { embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { responseEmbed } from "../ui/embeds.js";
import { formatDuration, truncate } from "../utils.js";

interface SnipeRecord {
  authorId: string;
  authorTag: string;
  content: string;
  attachmentUrls: string[];
  deletedAt: number;
}

const channelSnipes = new Map<string, SnipeRecord[]>();
const maxSnipes = 5;

export function trackDeletedMessage(message: Message<boolean> | PartialMessage): void {
  if (!message.inGuild() || message.author?.bot || message.partial) return;

  const content = message.content?.trim() || "[No text content]";
  const records = channelSnipes.get(message.channelId) ?? [];
  records.unshift({
    authorId: message.author.id,
    authorTag: message.author.tag,
    content,
    attachmentUrls: message.attachments.map((attachment) => attachment.url),
    deletedAt: Date.now()
  });
  channelSnipes.set(message.channelId, records.slice(0, maxSnipes));
}

export function buildSnipePayload(
  requesterId: string,
  channelId: string,
  index = 0
) {
  const records = channelSnipes.get(channelId) ?? [];
  if (!records.length) return null;

  const currentIndex = Math.min(Math.max(index, 0), records.length - 1);
  const record = records[currentIndex]!;
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(
      [
        `## ${emojis.info} Deleted Message ${currentIndex + 1}/${records.length}`,
        `**Author:** <@${record.authorId}> (${record.authorTag})`,
        `**Deleted:** ${formatDuration(Date.now() - record.deletedAt)} ago`,
        "",
        truncate(record.content, 1_500),
        record.attachmentUrls.length
          ? `\n**Attachments:** ${record.attachmentUrls.map((url) => `[Link](${url})`).join(", ")}`
          : ""
      ].filter(Boolean).join("\n")
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`snipe:${requesterId}:${channelId}:${currentIndex - 1}`)
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex === 0),
    new ButtonBuilder()
      .setCustomId(`snipe:${requesterId}:${channelId}:${currentIndex + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex >= records.length - 1)
  );

  return { embeds: [embed], components: [row] };
}

export async function handleSnipeButton(
  interaction: ButtonInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith("snipe:")) return false;
  const [, requesterId, channelId, rawIndex] = interaction.customId.split(":");
  if (!requesterId || !channelId || !rawIndex || interaction.user.id !== requesterId) {
    await interaction.reply({
      embeds: [responseEmbed("This snipe menu belongs to another moderator.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const payload = buildSnipePayload(requesterId, channelId, Number(rawIndex));
  if (!payload) {
    await interaction.update({
      embeds: [responseEmbed("No deleted messages are available anymore.", "info")],
      components: []
    });
    return true;
  }

  await interaction.update(payload);
  return true;
}
