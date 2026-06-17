import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageFlags,
  time,
  TimestampStyles
} from "discord.js";
import { RESTJSONErrorCodes } from "discord-api-types/v10";
import { logger } from "../logger.js";
import { chooseRandom } from "../utils.js";
import { embedColor } from "../config.js";
import { responseEmbed } from "../ui/embeds.js";
import {
  getGiveaway,
  listDueGiveaways,
  markGiveawayEnded,
  toggleGiveawayEntry
} from "../database/repositories/giveaways.js";

export const giveawayButtonPrefix = "giveaway:enter:";

export function giveawayComponents(messageId = "pending", disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${giveawayButtonPrefix}${messageId}`)
        .setLabel(disabled ? "Giveaway ended" : "Enter giveaway")
        .setEmoji("🎉")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  ];
}

export function giveawayEmbed(
  prize: string,
  winnerCount: number,
  endsAt: number,
  hostId: string,
  ended = false
) {
  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(
      `<:Xavion_info:1514856459765022750> ${ended ? `Ended: ${prize}` : `Giveaway: ${prize}`}`
    )
    .setDescription(
      ended
        ? "This giveaway has ended."
        : `Click the button below to enter.\nEnds ${time(
            new Date(endsAt),
            TimestampStyles.RelativeTime
          )}.`
    )
    .addFields(
      { name: "Winners", value: String(winnerCount), inline: true },
      { name: "Hosted by", value: `<@${hostId}>`, inline: true }
    );
}

export async function handleGiveawayButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith(giveawayButtonPrefix) || !interaction.inCachedGuild()) return;
  const messageId = interaction.customId.slice(giveawayButtonPrefix.length);
  const entryResult = await toggleGiveawayEntry(messageId, interaction.user.id);
  if (entryResult === "missing") {
    await interaction.reply({
      embeds: [responseEmbed("This giveaway has already ended.", "error")],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (entryResult === "left") {
    await interaction.reply({
      embeds: [responseEmbed("You left the giveaway.", "info")],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    embeds: [responseEmbed("You entered the giveaway. Good luck!", "success")],
    flags: MessageFlags.Ephemeral
  });
}

export async function finishGiveaway(
  client: Client,
  messageId: string,
  reroll = false
): Promise<string[]> {
  const giveaway = await getGiveaway(messageId);
  if (!giveaway) throw new Error("Giveaway not found.");
  if (giveaway.ended && !reroll) throw new Error("Giveaway has already ended.");
  if (!giveaway.ended && reroll) throw new Error("Only ended giveaways can be rerolled.");

  const winners = chooseRandom(
    giveaway.entries,
    giveaway.winnerCount
  );

  const channel = await client.channels.fetch(giveaway.channelId).catch((error: unknown) => {
    if (isMissingDiscordResource(error)) return null;
    throw error;
  });
  if (!channel?.isTextBased() || channel.isDMBased()) {
    if (!reroll) {
      await markGiveawayEnded(messageId);
      logger.warn(
        { messageId, channelId: giveaway.channelId },
        "Giveaway channel is missing; marked ended"
      );
      return [];
    }
    throw new Error("Giveaway channel not found.");
  }
  const message = await channel.messages.fetch(messageId).catch((error: unknown) => {
    if (isMissingDiscordResource(error)) return null;
    throw error;
  });
  if (!message) {
    if (!reroll) {
      await markGiveawayEnded(messageId);
      logger.warn(
        { messageId, channelId: giveaway.channelId },
        "Giveaway message is missing; marked ended"
      );
      return [];
    }
    throw new Error("Giveaway message not found.");
  }

  if (!reroll) {
    await markGiveawayEnded(messageId);
    await message.edit({
      embeds: [
        giveawayEmbed(
          giveaway.prize,
          giveaway.winnerCount,
          giveaway.endsAt.getTime(),
          giveaway.hostId,
          true
        )
      ],
      components: giveawayComponents(messageId, true)
    });
  }

  const winnerText =
    winners.length > 0
      ? winners.map((id) => `<@${id}>`).join(", ")
      : "No valid entries";
  await channel.send({
    embeds: [
      responseEmbed(
        reroll
          ? `New winner(s) for **${giveaway.prize}**: ${winnerText}`
          : `Congratulations ${winnerText}! You won **${giveaway.prize}**.`,
        "success"
      )
    ]
  });
  return winners;
}

function isMissingDiscordResource(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === RESTJSONErrorCodes.UnknownMessage ||
      error.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

export function startGiveawayScheduler(client: Client): NodeJS.Timeout {
  const check = async () => {
    const due = await listDueGiveaways();
    for (const messageId of due) {
      await finishGiveaway(client, messageId).catch((error) =>
        logger.error({ error, messageId }, "Failed to finish giveaway")
      );
    }
  };
  void check();
  return setInterval(() => void check(), 15_000);
}
