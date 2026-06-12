import pino from "pino";
import { config } from "./config.js";

const options = {
  level: config.LOG_LEVEL,
  redact: ["token", "DISCORD_TOKEN"]
};

export const logger =
  config.NODE_ENV === "development"
    ? pino({
        ...options,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname"
          }
        }
      })
    : pino(options);
