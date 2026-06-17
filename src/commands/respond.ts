import {
  MessageFlags,
  type EmbedBuilder
} from "discord.js";
import type { CommandContext } from "./types.js";

export async function replyWithEmbed(
  ctx: CommandContext,
  embed: EmbedBuilder,
  ephemeral = false
): Promise<void> {
  if (ctx.replyPayload) {
    await ctx.replyPayload({ embeds: [embed] }, ephemeral);
    return;
  }

  if (ctx.source.kind === "slash") {
    if (ctx.source.interaction.deferred || ctx.source.interaction.replied) {
      await ctx.source.interaction.followUp({
        embeds: [embed],
        flags: ephemeral ? MessageFlags.Ephemeral : undefined
      });
    } else {
      await ctx.source.interaction.reply({
        embeds: [embed],
        flags: ephemeral ? MessageFlags.Ephemeral : undefined
      });
    }
    return;
  }

  await ctx.source.message.reply({
    embeds: [embed],
    allowedMentions: { repliedUser: false }
  });
}
