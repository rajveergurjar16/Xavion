import {
  PermissionFlagsBits,
  type Message
} from "discord.js";
import { responseEmbed } from "../ui/embeds.js";
import {
  hasNicknameChannel,
  removeNicknameChannel
} from "../database/repositories/nickname-channels.js";
const urlPattern = /(?:https?:\/\/|www\.)\S+/i;

export async function handleNicknameChannelMessage(
  message: Message<true>
): Promise<boolean> {
  if (!(await hasNicknameChannel(message.guild.id, message.channel.id))) return false;

  const member = message.member;
  if (!member) {
    await sendError(message, "I could not resolve your server member.");
    return true;
  }

  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    await sendError(message, "I need the Manage Nicknames permission.");
    return true;
  }
  if (member.id === message.guild.ownerId) {
    await sendError(message, "The server owner's nickname cannot be changed.");
    return true;
  }
  if (!member.manageable) {
    await sendError(message, "I cannot change your nickname because your role is above mine.");
    return true;
  }
  if (
    message.attachments.size > 0 ||
    message.stickers.size > 0 ||
    message.embeds.length > 0
  ) {
    await sendError(message, "Media, attachments, stickers, and embeds are not allowed here.");
    return true;
  }

  const content = message.content.trim();
  if (!content) {
    await sendError(message, "Send plain text to set your nickname, or type `reset`.");
    return true;
  }
  if (content.includes("\n") || content.includes("\r")) {
    await sendError(message, "Nicknames must be a single line.");
    return true;
  }
  if (urlPattern.test(content)) {
    await sendError(message, "Links are not allowed as nicknames.");
    return true;
  }
  if (content.length > 32) {
    await sendError(
      message,
      `Nickname is too long. Discord allows up to 32 characters; yours has ${content.length}.`
    );
    return true;
  }

  const reset = content.toLowerCase() === "reset";
  if (reset && member.nickname === null) {
    await message.reply({
      embeds: [responseEmbed("Your nickname is already reset.", "info")],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }
  if (!reset && member.nickname === content) {
    await message.reply({
      embeds: [responseEmbed(`Your nickname is already **${content}**.`, "info")],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  try {
    await member.setNickname(
      reset ? null : content,
      `Nickname channel request by ${message.author.tag}`
    );
    await message.reply({
      embeds: [
        responseEmbed(
          reset
            ? `<@${member.id}>, your nickname has been reset successfully.\nSend a new nickname here whenever you want to change it again.`
            : `<@${member.id}>, your nickname has been changed to **${content}**.\nType \`reset\` in this channel to reset your nickname.`,
          "success"
        )
      ],
      allowedMentions: { repliedUser: false }
    });
  } catch {
    await sendError(message, "Discord rejected that nickname. Try different plain text.");
  }
  return true;
}

export function removeDeletedNicknameChannel(
  guildId: string,
  channelId: string
): Promise<boolean> {
  return removeNicknameChannel(guildId, channelId);
}

async function sendError(message: Message<true>, text: string): Promise<void> {
  await message.reply({
    embeds: [responseEmbed(text, "error")],
    allowedMentions: { repliedUser: false }
  });
}
