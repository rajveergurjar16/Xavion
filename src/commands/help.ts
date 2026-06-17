import {
  ActionRowBuilder,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  type Client,
  type User
} from "discord.js";
import { config, embedColor } from "../config.js";
import { responseEmbed } from "../ui/embeds.js";
import type { Command } from "./types.js";

type HelpCategory = {
  id: string;
  label: string;
  description: string;
  developerOnly?: boolean;
  commands: string[];
  aliases: string[];
};

const invitePermissions = "1374525156374";

const categories: HelpCategory[] = [
  {
    id: "moderation",
    label: "Moderation",
    description: "Moderation and server safety commands.",
    commands: [
      "ban",
      "unban",
      "massban",
      "massunban",
      "kick",
      "timeout",
      "untimeout",
      "warn",
      "removewarn",
      "warnings",
      "warnconfig add",
      "warnconfig remove",
      "warnconfig list",
      "warnconfig clear",
      "nickname",
      "nickname channel set",
      "nickname channel remove",
      "nickname channel list",
      "purge",
      "role add",
      "role remove",
      "lock",
      "unlock",
      "hide",
      "unhide"
    ],
    aliases: [
      "banuser",
      "ub",
      "mban",
      "munban",
      "mub",
      "kickuser",
      "mute",
      "unmute",
      "warning",
      "delwarn",
      "rw",
      "warns",
      "wconfig",
      "nick",
      "clear",
      "roles",
      "lockchannel",
      "unlockchannel",
      "hidechannel",
      "unhidechannel"
    ]
  },
  {
    id: "utility",
    label: "Utility",
    description: "Everyday utility commands.",
    commands: [
      "help",
      "ping",
      "snipe",
      "say",
      "avatar",
      "afk",
      "slowmode"
    ],
    aliases: [
      "commands",
      "latency",
      "snipes",
      "announce",
      "av",
      "pfp",
      "away",
      "slow"
    ]
  },
  {
    id: "information",
    label: "Information",
    description: "Bot, server, and user information.",
    commands: [
      "botinfo",
      "serverinfo",
      "userinfo"
    ],
    aliases: [
      "bi",
      "aboutbot",
      "si",
      "guildinfo",
      "ui",
      "whois"
    ]
  },
  {
    id: "giveaway",
    label: "Giveaway",
    description: "Giveaway management commands.",
    commands: [
      "giveaway start",
      "giveaway end",
      "giveaway reroll",
      "giveaway info",
      "giveaway list"
    ],
    aliases: [
      "gstart",
      "gaw"
    ]
  },
  {
    id: "developers",
    label: "Developers",
    description: "Developer-only global controls.",
    developerOnly: true,
    commands: [
      "npadd",
      "nprem",
      "npusers"
    ],
    aliases: [
      "npa",
      "npr",
      "npremove",
      "nplist"
    ]
  }
];

export const helpCommand: Command = {
  name: "help",
  aliases: ["commands"],
  description: "Open Xavion's help menu",
  slash: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Open Xavion's help menu"),
  async execute(ctx) {
    const payload = buildHelpPayload(
      ctx.member.id,
      "home",
      ctx.guild.client,
      ctx.member.user
    );
    await ctx.replyPayload?.(
      { ...payload, flags: MessageFlags.Ephemeral },
      true
    );
  }
};

export async function handleHelpInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith("xhelp:")) return false;
  const [, action, requesterId] = interaction.customId.split(":");
  if (!requesterId || interaction.user.id !== requesterId) {
    await interaction.reply({
      embeds: [responseEmbed("This help menu belongs to another user.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const category = interaction.isStringSelectMenu()
    ? interaction.values[0] ?? "home"
    : action ?? "home";
  await interaction.update(
    buildHelpPayload(requesterId, category, interaction.client, interaction.user)
  );
  return true;
}

export function buildHelpPayload(
  requesterId: string,
  selectedId: string,
  client?: Client,
  requester?: User
) {
  const visible = visibleCategories(requesterId);
  const selected = visible.find((category) => category.id === selectedId);
  const totalGuilds = client?.guilds.cache.size ?? 0;
  const totalUsers =
    client?.guilds.cache.reduce(
      (total, guild) => total + (guild.memberCount ?? 0),
      0
    ) ?? 0;
  const commandCount = visible.reduce(
    (total, category) => total + category.commands.length,
    0
  );

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle("Flexy Help Menu")
    .setThumbnail(client?.user?.displayAvatarURL({ size: 256 }) ?? null)
    .setFooter({
      text: `Requested by ${requester ? `@${requester.username}` : "Unknown User"}`,
      ...(requester ? { iconURL: requester.displayAvatarURL({ size: 64 }) } : {})
    });

  if (selected) {
    embed.addFields(
      {
        name: "Commands",
        value: `> ${formatCommandList(selected.commands)}`
      },
      {
        name: "Alias",
        value: `> ${
          selected.aliases.length
            ? formatCommandList(selected.aliases)
            : "No aliases"
        }`
      }
    );
  } else {
    embed
      .addFields(
        {
          name: "__**Basic Information:**__",
          value: [
            `> Server Prefix : ${config.PREFIX}`,
            `> Total Users : ${totalUsers.toLocaleString("en-US")}`,
            `> Total Guilds : ${totalGuilds.toLocaleString("en-US")}`,
            `> Commands Used : ${commandCount.toLocaleString("en-US")} (Global)`
          ].join("\n")
        },
        {
          name: "__**Categories**__",
          value: [homeLabel(), ...visible.map((category) => category.label)]
            .map((label) => `> ${label}`)
            .join("\n")
        },
        {
          name: "__**Useful Links**__",
          value: `[Invite Xavion](${botInviteUrl()}) | [support server](${config.SUPPORT_SERVER_URL})`
        }
      )
      .setDescription("-# select a Category from dropdown menu");
  }

  const selector = new StringSelectMenuBuilder()
    .setCustomId(`xhelp:select:${requesterId}`)
    .setPlaceholder("Select a Category")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(homeLabel())
        .setDescription("Return to the help menu home")
        .setValue("home")
        .setDefault(!selected),
      ...visible.map((category) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(category.label)
          .setDescription(category.description.slice(0, 100))
          .setValue(category.id)
          .setDefault(selected?.id === category.id)
      )
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selector)
    ]
  };
}

function formatCommandList(commands: string[]): string {
  return commands
    .map((command) => `${config.PREFIX}${command}`)
    .join(", ");
}

function visibleCategories(userId: string): HelpCategory[] {
  const isDeveloper = config.DEVELOPER_IDS.includes(userId);
  return categories.filter(
    (category) => !category.developerOnly || isDeveloper
  );
}

function homeLabel(): string {
  return "Home";
}

function botInviteUrl(): string {
  return (
    config.BOT_INVITE_URL ??
    `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&permissions=${invitePermissions}&scope=bot%20applications.commands`
  );
}
