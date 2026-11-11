import type { Track } from "@/types";

export type AssistantIntent = "search" | "play" | "playlist" | "similar";

export interface AiSource {
  title: string;
  url: string;
  site?: string;
}

export interface AssistantResult {
  intent: AssistantIntent;
  title: string;
  explanation: string;
  trackIds: string[];
  actions?: Array<{ name: string; status: string; detail?: string }>;
  sources?: AiSource[];
}

export interface AssistantContext {
  tracks: Track[];
  favorites: string[];
  currentTrackId: string | null;
}

export interface AssistantTurn {
  id: string;
  prompt: string;
  createdAt: number;
  result?: AssistantResult;
  error?: string;
  streaming?: string;
  activity?: string[];
  provider?: "deepseek" | "local";
  contextTrackId?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  turnCount: number;
  preview: string;
  songIds: string[];
}

export interface ConversationTurn {
  id: string;
  prompt: string;
  createdAt: number;
  result?: AssistantResult;
  error?: string;
  activity?: string[];
  provider?: "deepseek" | "local";
  contextTrackId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  turns: ConversationTurn[];
}

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
  source: "user" | "ai";
  tags?: string[];
}

export interface SongMemory {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  year: number;
  summary: string;
  facts: MemoryFact[];
  factCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileMemory {
  id: string;
  text: string;
  tags: string[];
  importance: number;
  source: "user" | "ai";
  createdAt: number;
  updatedAt: number;
}

export interface MemorySnapshot {
  songs: SongMemory[];
  profile: ProfileMemory[];
  stats: {
    songs: number;
    facts: number;
    profile: number;
    updatedAt: number;
  };
}

export interface ConnectionStatus {
  enabled: boolean;
  model: string;
  hasKey: boolean;
  storage: string;
  baseUrl: string;
  busy: boolean;
  webSearchEnabled: boolean;
  conversations?: number;
  memory?: MemorySnapshot["stats"];
}

export interface ChatResponse extends AssistantResult {
  conversationId: string;
  conversation?: ConversationSummary;
  turnId?: string;
}
