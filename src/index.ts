import {
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from "discord.js";
import { config } from "./config.js";
import {
  closeDatabase,
  initializeDatabase
} from "./database/index.js";
import { startGiveawayScheduler } from "./services/giveaways.js";
import { startPresenceRotation } from "./services/presence.js";
import { registerHandlers } from "./events/handler.js";
import { logger } from "./logger.js";
import {
  ensureAllModLogChannels,
  registerModLogSetup
} from "./services/modlogs.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
  allowedMentions: {
    parse: ["users", "roles"],
    repliedUser: false
  },
  presence: { status: config.BOT_STATUS },
  failIfNotExists: false
});

await initializeDatabase();
registerHandlers(client);
registerModLogSetup(client);

let giveawayTimer: NodeJS.Timeout | undefined;
let presenceTimer: NodeJS.Timeout | undefined;

client.once(Events.ClientReady, async (readyClient) => {
  presenceTimer = startPresenceRotation(readyClient);
  await ensureAllModLogChannels(readyClient);
  giveawayTimer = startGiveawayScheduler(readyClient);
  logger.info(
    { tag: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
    "Xavion is ready"
  );
});

client.on(Events.ShardResume, () => {
  if (presenceTimer) clearInterval(presenceTimer);
  if (client.isReady()) presenceTimer = startPresenceRotation(client);
});

client.on(Events.Error, (error) => logger.error({ error }, "Discord client error"));
client.on(Events.Warn, (message) => logger.warn({ message }, "Discord client warning"));

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  if (giveawayTimer) clearInterval(giveawayTimer);
  if (presenceTimer) clearInterval(presenceTimer);
  client.destroy();
  await closeDatabase();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) =>
  logger.error({ error }, "Unhandled promise rejection")
);
process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  process.exit(1);
});

await client.login(config.DISCORD_TOKEN);