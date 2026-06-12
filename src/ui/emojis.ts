export const emojis = {
  success: "<:Xavion_tick:1514856104943947786>",
  error: "<:Xavion_cross:1514856199592476672>",
  info: "<:Xavion_info:1514856459765022750>"
} as const;

export type ReplyTone = keyof typeof emojis;

export function withEmoji(message: string, tone: ReplyTone = "info"): string {
  return `${emojis[tone]} | ${message}`;
}
