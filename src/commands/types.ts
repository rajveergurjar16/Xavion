import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  EmbedBuilder,
  Message,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from "discord.js";
import type { ReplyTone } from "../ui/emojis.js";

export interface CommandReplyPayload {
  content?: string;
  embeds?: EmbedBuilder[];
  components?: unknown[];
  flags?: unknown;
  allowedMentions?: unknown;
}

export type CommandSource =
  | { kind: "prefix"; message: Message<true>; args: string[] }
  | { kind: "slash"; interaction: ChatInputCommandInteraction<"cached"> };

export interface CommandContext {
  source: CommandSource;
  guild: Guild;
  member: GuildMember;
  channel: GuildTextBasedChannel;
  startLoading?(content: string): Promise<void>;
  getLoadingMessageId?(): string | null;
  reply(content: string, ephemeral?: boolean, tone?: ReplyTone): Promise<void>;
  replyPayload?(payload: CommandReplyPayload, ephemeral?: boolean): Promise<void>;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  userPermissions?: PermissionResolvable[];
  botPermissions?: PermissionResolvable[];
  developerOnly?: boolean;
  cooldown?: number;
  slash:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute(ctx: CommandContext): Promise<void>;
}
