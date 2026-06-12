import { EmbedBuilder } from "discord.js";
import { embedColor } from "../config.js";
import { withEmoji, type ReplyTone } from "./emojis.js";

export function responseEmbed(
  description: string,
  tone: ReplyTone = "info",
  title?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setDescription(withEmoji(description, tone));
  if (title) embed.setTitle(title);
  return embed;
}
