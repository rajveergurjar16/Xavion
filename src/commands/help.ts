import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder
} from "discord.js";
import { config, embedColor } from "../config.js";
import { emojis } from "../ui/emojis.js";
import { responseEmbed } from "../ui/embeds.js";
import type { Command } from "./types.js";

type HelpCategory = {
  id: string;
  label: string;
  description: string;
  developerOnly?: boolean;
  commands: HelpCommand[];
};

type HelpCommand = {
  usage: string;
  description: string;
  aliases?: string[];
};

const categories: HelpCategory[] = [
  {
    id: "moderation",
    label: "Moderation",
    description: "Member discipline and server safety.",
    commands: [
      {
        usage: "ban <@user|userID> [reason]",
        description: "Ban a mention or user ID.",
        aliases: ["banuser"]
      },
      {
        usage: "unban <userID> [reason]",
        description: "Remove a user's ban.",
        aliases: ["ub"]
      },
      {
        usage: "kick <@user> [reason]",
        description: "Kick a server member.",
        aliases: ["kickuser"]
      },
      {
        usage: "timeout <@user> <duration> [reason]",
        description: "Apply or extend a member timeout.",
        aliases: ["mute"]
      },
      {
        usage: "untimeout <@user> [reason]",
        description: "Remove an active timeout.",
        aliases: ["unmute"]
      },
      {
        usage: "nickname <@user> [nickname]",
        description: "Change or reset a member's nickname.",
        aliases: ["nick"]
      },
      {
        usage: "nickname channel set <#channel>",
        description: "Add a nickname channel."
      },
      {
        usage: "nickname channel remove <#channel>",
        description: "Remove a nickname channel."
      },
      {
        usage: "nickname channel list",
        description: "List configured nickname channels."
      },
      {
        usage: "purge <1-100>",
        description: "Delete recent messages.",
        aliases: ["clear"]
      },
      {
        usage: "purge <@user|userID> <1-100>",
        description: "Delete recent messages from one user.",
        aliases: ["clear"]
      }
    ]
  },
  {
    id: "warnings",
    label: "Warnings",
    description: "Track infractions and automate consequences.",
    commands: [
      {
        usage: "warn <@user> <reason>",
        description: "Add a warning to a member.",
        aliases: ["warning"]
      },
      {
        usage: "removewarn <warningID>",
        description: "Remove a warning by ID.",
        aliases: ["delwarn", "rw"]
      },
      {
        usage: "warnings <@user|userID>",
        description: "Browse a member's warning history.",
        aliases: ["warns"]
      },
      {
        usage: "warnconfig add <count> timeout <duration>",
        description: "Add an automatic timeout threshold.",
        aliases: ["wconfig"]
      },
      {
        usage: "warnconfig add <count> <kick|ban>",
        description: "Add an automatic kick or ban threshold.",
        aliases: ["wconfig"]
      },
      {
        usage: "warnconfig remove <count>",
        description: "Remove one warning action.",
        aliases: ["wconfig"]
      },
      {
        usage: "warnconfig list",
        description: "List automatic warning actions.",
        aliases: ["wconfig"]
      },
      {
        usage: "warnconfig clear",
        description: "Clear all automatic warning actions.",
        aliases: ["wconfig"]
      }
    ]
  },
  {
    id: "channels",
    label: "Channels",
    description: "Control text, forum, voice, and stage access.",
    commands: [
      {
        usage: "lock [#channel|channelID]",
        description: "Lock messages or voice connections.",
        aliases: ["lockchannel"]
      },
      {
        usage: "unlock [#channel|channelID]",
        description: "Restore messages or voice connections.",
        aliases: ["unlockchannel"]
      },
      {
        usage: "hide [#channel|channelID]",
        description: "Hide a channel from everyone.",
        aliases: ["hidechannel"]
      },
      {
        usage: "unhide [#channel|channelID]",
        description: "Restore channel visibility.",
        aliases: ["unhidechannel"]
      }
    ]
  },
  {
    id: "systems",
    label: "Systems",
    description: "General Xavion tools and event systems.",
    commands: [
      {
        usage: "help",
        description: "Open this command deck.",
        aliases: ["commands"]
      },
      {
        usage: "ping",
        description: "Measure API and database latency.",
        aliases: ["latency"]
      },
      {
        usage: "giveaway start <duration> <winners> <prize>",
        description: "Start a giveaway.",
        aliases: ["gstart", "gaw"]
      },
      {
        usage: "giveaway end <messageID>",
        description: "End a giveaway immediately.",
        aliases: ["gstart", "gaw"]
      },
      {
        usage: "giveaway reroll <messageID>",
        description: "Reroll an ended giveaway.",
        aliases: ["gstart", "gaw"]
      }
    ]
  },
  {
    id: "developer",
    label: "Developer",
    description: "Global controls reserved for Xavion developers.",
    developerOnly: true,
    commands: [
      {
        usage: "npadd <@user|userID>",
        description: "Grant global no-prefix access.",
        aliases: ["npa"]
      },
      {
        usage: "nprem <@user|userID>",
        description: "Remove global no-prefix access.",
        aliases: ["npr", "npremove"]
      },
      {
        usage: "npusers",
        description: "Browse global no-prefix users.",
        aliases: ["nplist"]
      }
    ]
  }
];

export const helpCommand: Command = {
  name: "help",
  aliases: ["commands"],
  description: "Open Xavion's command deck",
  slash: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Open Xavion's command deck"),
  async execute(ctx) {
    const payload = buildHelpPayload(ctx.member.id, "home");
    if (ctx.source.kind === "slash") {
      await ctx.source.interaction.reply({
        ...payload,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
      });
    } else {
      await ctx.source.message.reply({
        ...payload,
        flags: MessageFlags.IsComponentsV2
      });
    }
  }
};

export async function handleHelpInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith("xhelp:")) return false;
  const [, action, requesterId] = interaction.customId.split(":");
  if (!requesterId || interaction.user.id !== requesterId) {
    await interaction.reply({
      embeds: [responseEmbed("This command deck belongs to another user.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (action === "close" && interaction.isButton()) {
    const closed = new ContainerBuilder()
      .setAccentColor(embedColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojis.info} | Xavion's command deck has been closed.`
        )
      );
    await interaction.update({ components: [closed] });
    return true;
  }

  const category = interaction.isStringSelectMenu()
    ? interaction.values[0] ?? "home"
    : "home";
  await interaction.update(buildHelpPayload(requesterId, category));
  return true;
}

export function buildHelpPayload(
  requesterId: string,
  selectedId: string
) {
  const visible = visibleCategories(requesterId);
  const selected = visible.find((category) => category.id === selectedId);
  const commandCount = visible.reduce(
    (total, category) => total + category.commands.length,
    0
  );
  const body = selected
    ? [
        `## ${selected.label}`,
        `-# ${selected.description}`,
        "",
        ...selected.commands.map(formatHelpCommand)
      ].join("\n")
    : [
        `## ${emojis.info} Xavion Command Deck`,
        "Choose a module below to inspect its commands.",
        "",
        `**Prefix:** \`${config.PREFIX}\``,
        `**Categories:** \`${visible.length}\``,
        `**Command usages:** \`${commandCount}\``,
        "",
        "-# Required: <value> • Optional: [value]"
      ].join("\n");

  const selector = new StringSelectMenuBuilder()
    .setCustomId(`xhelp:select:${requesterId}`)
    .setPlaceholder("Choose a command module")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Command Deck")
        .setDescription("Return to the overview")
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
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`xhelp:home:${requesterId}`)
      .setLabel("Overview")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!selected),
    new ButtonBuilder()
      .setCustomId(`xhelp:close:${requesterId}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
  );
  const container = new ContainerBuilder()
    .setAccentColor(embedColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# XAVION // COMMAND DECK")
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selector)
    )
    .addActionRowComponents(controls)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# Prefix and slash commands share the same permission checks."
      )
    );

  return { components: [container] };
}

function visibleCategories(userId: string): HelpCategory[] {
  const isDeveloper = config.DEVELOPER_IDS.includes(userId);
  return categories.filter(
    (category) => !category.developerOnly || isDeveloper
  );
}

function formatHelpCommand(command: HelpCommand): string {
  const aliases = command.aliases?.length
    ? `\n-# Aliases: ${command.aliases
        .map((alias) => `\`${alias}\``)
        .join(", ")}`
    : "";
  return [`**${config.PREFIX}${command.usage}**`, `-# ${command.description}`, aliases]
    .filter(Boolean)
    .join("\n");
}
