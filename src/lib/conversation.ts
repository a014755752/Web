import type { AttendanceRecord } from "./attendance";
import type { AgentDocument, WebSource } from "./agent-documents";
import type { LedgerProposal } from "./ledger-proposal";

export type ConversationMessage = { role: "user" | "assistant"; content: string };
export type ActivityPair = { baselineId: string; targetId: string };

export type ChatInput = {
  kind: "chat";
  question: string;
  rows: AttendanceRecord[];
  useRules: boolean;
  eventId?: string;
  pair?: ActivityPair;
  history?: ConversationMessage[];
  documents?: AgentDocument[];
  allowWeb?: boolean;
};

export type ChatRun = {
  kind: "chat"; mode: "local" | "agent"; text: string; sources?: WebSource[];
  proposal?: LedgerProposal; pendingQuestions?: string[];
};

export function greetingReply(question: string) {
  const greeting = question.normalize("NFKC").trim();
  return /^(?:hi|hey|hello|你好|您好|嗨|哈喽|早上好|晚上好)(?:[\p{P}\s👋])*$/iu.test(greeting)
    ? "你好，我在。想聊些什么？"
    : undefined;
}
