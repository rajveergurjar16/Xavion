import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const body = commands.map((command) => command.slash.toJSON());
const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

await rest.put(route, { body });
logger.info(
  {
    count: body.length,
    scope: config.DISCORD_GUILD_ID ? `guild:${config.DISCORD_GUILD_ID}` : "global"
  },
  "Application commands deployed"
);
