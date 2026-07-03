import { ActivityType, type Client } from "discord.js";
import { config } from "../config.js";
import { formatDuration } from "../utils.js";

/**
 * How often the bot's activity rotates. Discord.js re-sends the full
 * presence payload on every call, so this only needs to be a lightweight
 * gateway op — no extra requests are made.
 */
const ROTATION_INTERVAL_MS = 15_000;

interface PresenceStep {
  name: string;
  type: ActivityType;
  url?: string;
}

function totalMembers(client: Client<true>): number {
  return client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
}

/**
 * Builds the 4 rotating activities using live stats at call time, so every
 * rotation reflects the bot's current guild/member count and uptime.
 *
 * Note: Discord automatically prefixes the activity name based on its type
 * ("Playing", "Listening to", "Watching", "Streaming"), so the `name`
 * values below intentionally omit that prefix to avoid it being duplicated.
 */
function buildSteps(client: Client<true>): PresenceStep[] {
  const guildCount = client.guilds.cache.size;
  const userCount = totalMembers(client);
  const uptime = formatDuration(client.uptime ?? 0);

  return [
    {
      // Renders as: "Streaming to X | Watch with me..!"
      name: "Streaming to X | Watch with me..!",
      type: ActivityType.Streaming,
      url: config.BOT_STREAM_URL
    },
    {
      // Renders as: "Listening to {users} users across {servers} servers"
      name: `Playing With ${userCount} users across ${guildCount} servers`,
      type: ActivityType.Playing
    },
    {
      // Renders as: "Playing beyond limits since {uptime}"
      name: `Playing beyond limits since ${uptime}`,
      type: ActivityType.Playing
    },
    {
      // Renders as: "Watching the {servers} Servers"
      name: `Watching ${guildCount} Servers`,
      type: ActivityType.Watching
    }
  ];
}

/**
 * Starts rotating the bot's activity through Streaming, Listening, Playing
 * and Watching states. Status (online/idle/dnd/invisible) stays fixed from
 * config.BOT_STATUS — only the activity text/type rotates.
 */
export function startPresenceRotation(client: Client<true>): NodeJS.Timeout {
  let index = 0;

  const applyNext = () => {
    const steps = buildSteps(client);
    const step = steps[index % steps.length]!;

    client.user.setPresence({
      status: config.BOT_STATUS,
      activities: [
        {
          name: step.name,
          type: step.type,
          ...(step.url ? { url: step.url } : {})
        }
      ]
    });

    index += 1;
  };

  applyNext();
  return setInterval(applyNext, ROTATION_INTERVAL_MS);
}