import type { Message } from "discord.js";
import { removeAfkUser, getCachedAfkUser } from "../database/repositories/afk.js";
import { formatDuration, truncate } from "../utils.js";
import { responseEmbed } from "../ui/embeds.js";

export async function handleAfkMessage(message: Message<true>): Promise<void> {
  const removed = await removeAfkUser(message.author.id);
  if (removed) {
    await message.reply({
      embeds: [
        responseEmbed(
          `Welcome back <@${message.author.id}>. I removed your AFK status after **${formatDuration(Date.now() - removed.setAt.getTime())}**.`,
          "success"
        )
      ],
      allowedMentions: { repliedUser: false, users: [] }
    }).catch(() => undefined);
  }

  const notified = new Set<string>();
  for (const user of message.mentions.users.values()) {
    if (user.bot || notified.has(user.id) || user.id === message.author.id) continue;
    const afk = getCachedAfkUser(user.id);
    if (!afk) continue;
    notified.add(user.id);
    await message.reply({
      embeds: [
        responseEmbed(
          `<@${user.id}> is AFK.\n**Reason:** ${truncate(afk.reason, 400)}\n**Since:** ${formatDuration(Date.now() - afk.setAt.getTime())} ago`,
          "info"
        )
      ],
      allowedMentions: { repliedUser: false, users: [] }
    }).catch(() => undefined);
  }
}
