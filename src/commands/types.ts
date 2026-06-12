import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from "discord.js";
import type { ReplyTone } from "../ui/emojis.js";

export type CommandSource =
  | { kind: "prefix"; message: Message<true>; args: string[] }
  | { kind: "slash"; interaction: ChatInputCommandInteraction<"cached"> };

export interface CommandContext {
  source: CommandSource;
  guild: Guild;
  member: GuildMember;
  channel: GuildTextBasedChannel;
  reply(content: string, ephemeral?: boolean, tone?: ReplyTone): Promise<void>;
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
