import type { User } from "discord.js";
import { responseEmbed } from "../ui/embeds.js";

export type DmDeliveryStatus = "delivered" | "failed" | "not_applicable";

interface ModerationDm {
  action: string;
  guildName: string;
  moderatorId: string;
  reason?: string;
  details?: string;
}

export async function sendModerationDm(
  user: User,
  notice: ModerationDm
): Promise<DmDeliveryStatus> {
  const lines = [
    `**Action:** ${notice.action}`,
    `**Server:** ${notice.guildName}`,
    `**Moderator:** <@${notice.moderatorId}>`,
    `**Reason:** ${notice.reason ?? "No reason provided"}`
  ];
  if (notice.details) lines.push(`**Details:** ${notice.details}`);

  try {
    await user.send({
      embeds: [responseEmbed(lines.join("\n"), "info", "Moderation Notice")]
    });
    return "delivered";
  } catch {
    return "failed";
  }
}
