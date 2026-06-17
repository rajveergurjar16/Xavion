import { channelCommands } from "./channels.js";
import { developerCommands } from "./developers.js";
import { giveawayCommand } from "./giveaway.js";
import { helpCommand } from "./help.js";
import { informationCommands } from "./information.js";
import { moderationCommands } from "./moderation.js";
import { pingCommand } from "./ping.js";
import { purgeCommand } from "./purge.js";
import { snipeCommand } from "./snipe.js";
import type { Command } from "./types.js";
import { utilityCommands } from "./utility.js";
import { warningCommands } from "./warnings.js";

export const commands: Command[] = [
  helpCommand,
  pingCommand,
  ...informationCommands,
  ...utilityCommands,
  snipeCommand,
  purgeCommand,
  ...developerCommands,
  ...moderationCommands,
  ...warningCommands,
  ...channelCommands,
  giveawayCommand
];

export const commandMap = new Map<string, Command>();
for (const command of commands) {
  commandMap.set(command.name, command);
  for (const alias of command.aliases ?? []) commandMap.set(alias, command);
}
