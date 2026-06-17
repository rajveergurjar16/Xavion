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
import { RESTJSONErrorCodes } from "discord-api-types/v10";
import { commandMap } from "../commands/index.js";
import type { Command, CommandContext, CommandReplyPayload } from "../commands/types.js";
import { config } from "../config.js";
import { handleGiveawayButton } from "../services/giveaways.js";
import { logger } from "../logger.js";
import { extractId, tokenize } from "../utils.js";
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
import { handleAfkMessage } from "../services/afk.js";
import { handleSnipeButton, trackDeletedMessage } from "../services/snipes.js";

const cooldowns = new Map<string, number>();

export function registerHandlers(client: Client): void {
  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.isDMBased()) {
      void removeDeletedNicknameChannel(channel.guildId, channel.id);
    }
  });

  client.on(Events.MessageDelete, (message) => {
    if (message.inGuild() && !message.author?.bot) {
      trackDeletedMessage(message);
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
    await handleAfkMessage(message);
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
      if (await handleSnipeButton(interaction)) return;
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
  await ctx.startLoading?.(loadingMessage(command, ctx), command.name !== "purge");
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
  let loadingMessage: Message<true> | null = null;
  let editedLoading = false;

  const sendPayload = async (payload: CommandReplyPayload): Promise<void> => {
    const sanitizedPayload = stripEphemeralFlagFromPayload(payload);
    const messagePayload = {
      ...sanitizedPayload,
      allowedMentions: payload.allowedMentions ?? { repliedUser: false }
    } as Parameters<Message<true>["reply"]>[0];
    if (loadingMessage && !editedLoading) {
      editedLoading = true;
      const edited = await loadingMessage
        .edit(
          prepareLoadingEdit(messagePayload) as Parameters<Message<true>["edit"]>[0]
        )
        .then(
          () => true,
          (error: unknown) => {
            if (isUnknownMessage(error)) return false;
            throw error;
          }
        );
      if (edited) return;
      loadingMessage = null;
      await message.reply(messagePayload);
      return;
    }
    await message.reply(messagePayload);
  };

  return {
    source: { kind: "prefix", message, args },
    guild: message.guild,
    member,
    channel,
    async startLoading(content, replyToUser = true) {
      const payload = {
        embeds: [responseEmbed(content, "loading")],
        allowedMentions: { repliedUser: false }
      };
      loadingMessage = replyToUser
        ? await message.reply(payload)
        : await channel.send(payload);
    },
    getLoadingMessageId() {
      return loadingMessage?.id ?? null;
    },
    async reply(content, _ephemeral, tone = "info") {
      await sendPayload({ embeds: [responseEmbed(content, tone)] });
    },
    async replyPayload(payload) {
      await sendPayload(payload);
    }
  };
}

function slashContext(
  interaction: ChatInputCommandInteraction<"cached">
): CommandContext {
  let loadingStarted = false;
  let editedLoading = false;

  const sendPayload = async (
    payload: CommandReplyPayload,
    ephemeral = false
  ): Promise<void> => {
    const interactionPayload = {
      ...payload,
      flags: payload.flags ?? (ephemeral ? MessageFlags.Ephemeral : undefined)
    } as Parameters<ChatInputCommandInteraction<"cached">["reply"]>[0];
    if (loadingStarted && !editedLoading) {
      editedLoading = true;
      const edited = await interaction
        .editReply(
          prepareLoadingEdit(
            stripEphemeralFlag(interactionPayload)
          ) as Parameters<ChatInputCommandInteraction<"cached">["editReply"]>[0]
        )
        .then(
          () => true,
          (error: unknown) => {
            if (isUnknownMessage(error)) return false;
            throw error;
          }
        );
      if (edited) return;
      await interaction.followUp(interactionPayload as Parameters<ChatInputCommandInteraction<"cached">["followUp"]>[0]);
      return;
    }
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(interactionPayload as Parameters<ChatInputCommandInteraction<"cached">["followUp"]>[0]);
    } else {
      await interaction.reply(interactionPayload);
    }
  };

  return {
    source: { kind: "slash", interaction },
    guild: interaction.guild,
    member: interaction.member,
    channel: interaction.channel as GuildTextBasedChannel,
    async startLoading(content) {
      loadingStarted = true;
      await interaction.reply({
        embeds: [responseEmbed(content, "loading")]
      });
    },
    getLoadingMessageId() {
      return null;
    },
    async reply(content, ephemeral = false, tone = "info") {
      await sendPayload({ embeds: [responseEmbed(content, tone)] }, ephemeral);
    },
    async replyPayload(payload, ephemeral = false) {
      await sendPayload(payload, ephemeral);
    }
  };
}

function stripEphemeralFlag(
  payload: Parameters<ChatInputCommandInteraction<"cached">["reply"]>[0]
): Parameters<ChatInputCommandInteraction<"cached">["reply"]>[0] {
  if (typeof payload !== "object" || payload === null || !("flags" in payload)) {
    return payload;
  }
  const flags = payload.flags;
  if (Array.isArray(flags)) {
    return {
      ...payload,
      flags: flags.filter((flag) => flag !== MessageFlags.Ephemeral)
    };
  }
  return flags === MessageFlags.Ephemeral
    ? { ...payload, flags: undefined }
    : payload;
}

function stripEphemeralFlagFromPayload<T>(payload: T): T {
  if (typeof payload !== "object" || payload === null || !("flags" in payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const flags = record.flags;
  if (Array.isArray(flags)) {
    return {
      ...record,
      flags: flags.filter((flag) => flag !== MessageFlags.Ephemeral)
    } as T;
  }
  return flags === MessageFlags.Ephemeral
    ? { ...record, flags: undefined } as T
    : payload;
}

function prepareLoadingEdit<T>(payload: T): T {
  if (typeof payload !== "object" || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  const flags = record.flags;
  const usesComponentsV2 =
    flags === MessageFlags.IsComponentsV2 ||
    (Array.isArray(flags) && flags.includes(MessageFlags.IsComponentsV2));
  if (!usesComponentsV2) return payload;
  return { ...record, embeds: [] } as T;
}

function isUnknownMessage(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === RESTJSONErrorCodes.UnknownMessage
  );
}

function loadingMessage(command: Command, ctx: CommandContext): string {
  const name = command.name;
  const args = ctx.source.kind === "prefix" ? ctx.source.args : [];
  const user = (key = "user", index = 0) => {
    let slashId: string | null = null;
    if (ctx.source.kind === "slash") {
      const slashUser = (() => {
        try {
          return ctx.source.kind === "slash"
            ? ctx.source.interaction.options.getUser(key, false)
            : null;
        } catch {
          return null;
        }
      })();
      const slashString = (() => {
        try {
          return ctx.source.kind === "slash"
            ? ctx.source.interaction.options.getString(key, false)
            : null;
        } catch {
          return null;
        }
      })();
      slashId = slashUser?.id ?? extractId(slashString ?? "");
    }
    const id = slashId ?? extractId(args[index] ?? "");
    return id ? `<@${id}>` : "target";
  };
  const channel = (key = "channel", index = 0) => {
    let slashId: string | null = null;
    if (ctx.source.kind === "slash") {
      slashId = ctx.source.interaction.options.getChannel(key, false)?.id ?? null;
    }
    const id = slashId ?? extractId(args[index] ?? "");
    return id ? `<#${id}>` : "this channel";
  };
  const subcommand = () =>
    ctx.source.kind === "slash"
      ? ctx.source.interaction.options.getSubcommand(false)
      : args[0]?.toLowerCase();

  if (name === "ping") return "Measuring ping...";
  if (name === "help") return "Opening Xavion command deck...";
  if (name === "ban") return `Banning ${user()}...`;
  if (name === "unban") return `Unbanning ${user("user_id")}...`;
  if (name === "massban") return "Processing mass ban...";
  if (name === "massunban") return "Processing mass unban...";
  if (name === "kick") return `Kicking ${user()}...`;
  if (name === "timeout") return `Giving timeout to ${user()}...`;
  if (name === "untimeout") return `Removing timeout from ${user()}...`;
  if (name === "warn") return `Warning ${user()}...`;
  if (name === "removewarn") return "Removing warning...";
  if (name === "warnings") return `Fetching warnings for ${user()}...`;
  if (name === "warnconfig") return "Updating warning configuration...";
  if (name === "purge") return "Deleting messages...";
  if (name === "lock") return `Locking ${channel()}...`;
  if (name === "unlock") return `Unlocking ${channel()}...`;
  if (name === "hide") return `Hiding ${channel()}...`;
  if (name === "unhide") return `Unhiding ${channel()}...`;
  if (name === "nickname") {
    return subcommand() === "channel"
      ? "Updating nickname channels..."
      : `Changing nickname for ${user()}...`;
  }
  if (name === "giveaway") return `${subcommand() ?? "Managing"} giveaway...`;
  if (name === "botinfo") return "Fetching bot information...";
  if (name === "serverinfo") return "Fetching server information...";
  if (name === "userinfo") return `Fetching user information for ${user()}...`;
  if (name === "avatar") return `Fetching avatar for ${user()}...`;
  if (name === "afk") return "Setting AFK status...";
  if (name === "say") return `Sending message in ${channel("channel", args.length - 1)}...`;
  if (name === "slowmode") return `Updating slowmode in ${channel("channel", 1)}...`;
  if (name === "role") return `${subcommand() === "remove" ? "Removing" : "Adding"} role...`;
  if (name === "snipe") return "Fetching deleted messages...";
  if (name === "npadd") return `Adding no-prefix access for ${user()}...`;
  if (name === "nprem") return `Removing no-prefix access from ${user()}...`;
  if (name === "npusers") return "Fetching no-prefix users...";
  return `Working on \`${name}\`...`;
}
