import { performance } from "node:perf_hooks";
import {
  ContainerBuilder,
  MessageFlags,
  Routes,
  SlashCommandBuilder,
  TextDisplayBuilder
} from "discord.js";
import { embedColor } from "../config.js";
import type { Command, CommandContext } from "./types.js";
import { pingDatabase } from "../database/client.js";

export const pingCommand: Command = {
  name: "ping",
  aliases: ["latency"],
  description: "Check Xavion's latency",
  cooldown: 5_000,
  slash: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check Xavion's latency"),
  async execute(ctx) {
    const [apiLatency, databaseLatency] = await Promise.all([
      measureApiLatency(ctx),
      measureDatabaseLatency()
    ]);
    const status = latencyStatus(Math.max(apiLatency, databaseLatency));
    const container = new ContainerBuilder()
      .setAccentColor(embedColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## __Xavion Responded__",
            `-# **Bot Latency:** \`${apiLatency}ms\``,
            `-# **Database Latency:** \`${databaseLatency}ms\``,
            `-# **Status:** \`${status}\``
          ].join("\n")
        )
      );

    await sendPing(ctx, container);
  }
};

async function measureApiLatency(ctx: CommandContext): Promise<number> {
  const startedAt = performance.now();
  await ctx.guild.client.rest.get(Routes.gateway());
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function measureDatabaseLatency(): Promise<number> {
  const startedAt = performance.now();
  await pingDatabase();
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function latencyStatus(latency: number): string {
  if (latency < 150) return "Excellent Latency";
  if (latency < 300) return "Moderate Latency";
  return "High Latency";
}

async function sendPing(
  ctx: CommandContext,
  container: ContainerBuilder
): Promise<void> {
  if (ctx.source.kind === "prefix") {
    await ctx.source.message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  await ctx.source.interaction.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}
