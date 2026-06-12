import { connectDatabase, closeDatabase } from "./client.js";
import { ensureGiveawayIndexes } from "./repositories/giveaways.js";
import { ensureNicknameChannelIndexes } from "./repositories/nickname-channels.js";
import { ensureNoPrefixIndexes } from "./repositories/no-prefix.js";
import { ensureWarningIndexes } from "./repositories/warnings.js";

export async function initializeDatabase(): Promise<void> {
  await connectDatabase();
  await Promise.all([
    ensureWarningIndexes(),
    ensureGiveawayIndexes(),
    ensureNicknameChannelIndexes(),
    ensureNoPrefixIndexes()
  ]);
}

export { closeDatabase };
