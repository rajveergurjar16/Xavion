import {
  ChatInputCommandInteraction,
  Client,
  Events,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  type GuildTextBasedChannel
} from "discord.js";
import { commandMap } from "../commands/index.js";
import type { Command, CommandContext } from "../commands/types.js";
import { config } from "../config.js";
import { handleGiveawayButton } from "../services/giveaways.js";
import { logger } from "../logger.js";
import { tokenize } from "../utils.js";
import { responseEmbed } from "../ui/embeds.js";
import { handleWarningButton } from "../commands/warnings.js";
import { handleNoPrefixButton } from "../commands/developers.js";
import { handleHelpInteraction } from "../commands/help.js";
import {
  handleNicknameChannelMessage,
  removeDeletedNicknameChannel
} from "../services/nickname-channels.js";
import { isNoPrefixUser } from "../database/repositories/no-prefix.js";
import {
  handleExactBotMention,
  handleMentionHelpButton
} from "../services/mention-greeting.js";

const cooldowns = new Map<string, number>();

export function registerHandlers(client: Client): void {
  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.isDMBased()) {
      void removeDeletedNicknameChannel(channel.guildId, channel.id);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;
    if (await handleExactBotMention(message)) return;
    const content = message.content;
    const hasPrefix = content.toLowerCase().startsWith(config.PREFIX.toLowerCase());
    const canSkipPrefix = !hasPrefix && isNoPrefixUser(message.author.id);
    if (hasPrefix || canSkipPrefix) {
      const body = hasPrefix ? content.slice(config.PREFIX.length).trim() : content.trim();
      const [rawName, ...args] = tokenize(body);
      const command = rawName ? commandMap.get(rawName.toLowerCase()) : undefined;
      const member = message.member;
      if (
        command &&
        member &&
        message.channel.isTextBased() &&
        !message.channel.isDMBased()
      ) {
        const ctx = prefixContext(message, member, message.channel, args);
        await runCommand(command, ctx);
        return;
      }
    }
    await handleNicknameChannelMessage(message);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      if (await handleHelpInteraction(interaction)) return;
    }
    if (interaction.isButton()) {
      if (await handleMentionHelpButton(interaction)) return;
      if (await handleHelpInteraction(interaction)) return;
      if (await handleNoPrefixButton(interaction)) return;
      if (await handleWarningButton(interaction)) return;
      await handleGiveawayButton(interaction).catch((error) => {
        logger.error({ error, customId: interaction.customId }, "Button handler failed");
      });
      return;
    }
    if (!interaction.isChatInputCommand() || !interaction.inCachedGuild()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    const ctx = slashContext(interaction);
    await runCommand(command, ctx);
  });
}

async function runCommand(command: Command, ctx: CommandContext): Promise<void> {
  const me = ctx.guild.members.me;
  if (!me) return ctx.reply("I could not resolve my server member. Please try again.", true, "error");

  if (command.developerOnly && !config.DEVELOPER_IDS.includes(ctx.member.id)) {
    return ctx.reply("This command is restricted to Xavion developers.", true, "error");
  }

  if (
    command.userPermissions?.some(
      (permission) => !ctx.member.permissions.has(permission)
    )
  ) {
    return ctx.reply("You do not have permission to use this command.", true, "error");
  }

  const botChannelPermissions = ctx.channel.permissionsFor(me);
  if (
    command.botPermissions?.some(
      (permission) => !botChannelPermissions?.has(permission)
    )
  ) {
    return ctx.reply("I am missing permissions required to run this command.", true, "error");
  }

  const key = `${ctx.guild.id}:${ctx.member.id}:${command.name}`;
  const now = Date.now();
  const expires = cooldowns.get(key) ?? 0;
  if (expires > now) {
    return ctx.reply(`Please wait ${Math.ceil((expires - now) / 1_000)}s before using that again.`, true, "info");
  }
  cooldowns.set(key, now + (command.cooldown ?? 1_500));

  try {
    await command.execute(ctx);
  } catch (error) {
    logger.error(
      { error, command: command.name, guildId: ctx.guild.id, userId: ctx.member.id },
      "Command failed"
    );
    await ctx.reply("Something went wrong while running that command.", true, "error").catch(() => undefined);
  }
}

function prefixContext(
  message: Message<true>,
  member: GuildMember,
  channel: GuildTextBasedChannel,
  args: string[]
): CommandContext {
  return {
    source: { kind: "prefix", message, args },
    guild: message.guild,
    member,
    channel,
    async reply(content, _ephemeral, tone = "info") {
      await message.reply({
        embeds: [responseEmbed(content, tone)],
        allowedMentions: { repliedUser: false }
      });
    }
  };
}

function slashContext(
  interaction: ChatInputCommandInteraction<"cached">
): CommandContext {
  return {
    source: { kind: "slash", interaction },
    guild: interaction.guild,
    member: interaction.member,
    channel: interaction.channel as GuildTextBasedChannel,
    async reply(content, ephemeral = false, tone = "info") {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          embeds: [responseEmbed(content, tone)],
          flags: ephemeral ? MessageFlags.Ephemeral : undefined
        });
      } else {
        await interaction.reply({
          embeds: [responseEmbed(content, tone)],
          flags: ephemeral ? MessageFlags.Ephemeral : undefined
        });
      }
    }
  };
}
