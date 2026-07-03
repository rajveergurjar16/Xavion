import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/),
  DISCORD_GUILD_ID: z.string().regex(/^\d+$/).optional(),
  DEVELOPER_IDS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d{17,20}$/.test(id))
    ),
  SUPPORT_SERVER_URL: z.string().url(),
  BOT_INVITE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  PREFIX: z.string().min(1).max(5).default("X"),
  BOT_STATUS: z
    .enum(["online", "idle", "dnd", "invisible"])
    .default("dnd"),
  // Discord only shows the "Streaming" badge when the activity has a valid
  // Twitch or YouTube URL attached. Used by the rotating presence.
  BOT_STREAM_URL: z.string().url().default("https://twitch.tv/discord"),
  EMBED_COLOR: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color such as #ccad00")
    .default("#ccad00"),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1).default("xavion"),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(20).default(2),
  MONGODB_DNS_SERVERS: z
    .string()
    .default("8.8.8.8,9.9.9.9")
    .transform((value) =>
      value
        .split(",")
        .map((server) => server.trim())
        .filter(Boolean)
    ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const config = result.data;
export const embedColor = Number.parseInt(config.EMBED_COLOR.slice(1), 16);