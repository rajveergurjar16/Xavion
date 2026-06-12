export interface WarningDocument {
  guildId: string;
  warningId: number;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: Date;
}

export interface WarningActionDocument {
  guildId: string;
  warningCount: number;
  action: "timeout" | "kick" | "ban";
  durationMs: number | null;
}

export interface GiveawayDocument {
  messageId: string;
  guildId: string;
  channelId: string;
  hostId: string;
  prize: string;
  winnerCount: number;
  endsAt: Date;
  ended: boolean;
  entries: string[];
}

export interface NicknameChannelDocument {
  guildId: string;
  channelId: string;
  createdBy: string;
  createdAt: Date;
}

export interface NoPrefixUserDocument {
  userId: string;
  addedBy: string;
  addedAt: Date;
}
