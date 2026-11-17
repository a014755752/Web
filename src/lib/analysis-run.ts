import { defaultCriteria, defaultScope, type AnalysisScope, type AttendanceRecord, type Criteria } from "./attendance";
import type { ComparisonInput, ComparisonRun } from "./comparison-run";
import type { ChatInput, ChatRun, ConversationMessage } from "./conversation";
import { activityScope, listActivities } from "./ledger-activities";
import { applicableRule, keywordRules } from "./rules";

export type AnalysisFollowUp =
  | { action: "inspect_promotion" | "verify_signup"; label: string }
  | { action: "fill_checkin"; key: string };

export type AnalysisRun = {
  mode: "local" | "agent";
  scope: AnalysisScope;
  criteria: Criteria;
  ruleId: string | null;
  sources: string[];
  retrieval: "vector" | "semantic" | "keyword" | "off";
  focus: "comparison" | "missing";
  followUp?: AnalysisFollowUp;
  note?: string;
};

export type ToolTrace = {
  id: string;
  key: string;
  status: "running" | "completed" | "failed" | "stopped";
  input: string;
  output?: string;
  durationMs?: number;
};

export type AnalysisStep = { name: string; detail: string; tool?: ToolTrace };

export type AnalysisEvent =
  | { type: "step"; step: AnalysisStep }
  | { type: "text"; delta: string }
  | { type: "result"; run: AnalysisResponse }
  | { type: "error"; message: string };

export type AnalysisResponse = AnalysisRun | ComparisonRun | ChatRun;

export type AnalysisInput = {
  kind?: "review";
  question: string;
  rows: AttendanceRecord[];
  scope: AnalysisScope;
  useRules: boolean;
  fixedScope?: boolean;
  workflow?: boolean;
  context?: string;
  history?: ConversationMessage[];
};

export type TaskInput = AnalysisInput | ComparisonInput | ChatInput;

function matchingValue(question: string, choices: string[]) {
  const matches = [...new Set(choices)].filter((item) => question.includes(item));
  return matches.length === 1 ? matches[0] : null;
}

export function runLocalAnalysis({ question, rows, scope, useRules, fixedScope }: AnalysisInput): AnalysisRun {
  const identifiers = question.toUpperCase().split(/[^A-Z0-9_-]+/u);
  const activities = listActivities(rows).filter(({ eventId, eventName }) =>
    question.includes(eventName) || identifiers.includes(eventId.toUpperCase()));
  const activity = activities.length === 1 ? activities[0] : undefined;
  const requestedScope = /全部活动|所有活动|全学期/u.test(question) ? defaultScope(rows)
    : activity ? activityScope(activity) : scope;
  const nextScope = { ...requestedScope, groupBy: scope.groupBy };
  if (/按活动类型|各类型|活动类型分组/.test(question)) nextScope.groupBy = "category";
  else if (/按.{0,4}渠道|哪个宣传渠道|比较.{0,8}渠道|各渠道/.test(question)) nextScope.groupBy = "channel";
  const month = question.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月/);
  if (month) {
    const year = Number(month[1] ?? scope.from?.slice(0, 4) ?? rows[0]?.date.slice(0, 4) ?? 2026);
    const number = Number(month[2]);
    if (year >= 1000 && number >= 1 && number <= 12) {
      const prefix = `${year}-${String(number).padStart(2, "0")}`;
      nextScope.from = `${prefix}-01`;
      nextScope.to = `${prefix}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
    }
  }
  nextScope.category = matchingValue(question, rows.map((row) => row.category)) ?? requestedScope.category;
  nextScope.channel = matchingValue(question, rows.map((row) => row.channel)) ?? requestedScope.channel;
  const resolved = fixedScope ? scope : nextScope;
  const rule = useRules ? applicableRule(resolved) : null;
  return {
    mode: "local",
    scope: resolved,
    criteria: rule?.criteria ?? defaultCriteria,
    ruleId: rule?.id ?? null,
    sources: useRules ? keywordRules(question, resolved).map(({ id }) => id) : [],
    retrieval: useRules ? "keyword" : "off",
    focus: /缺口|缺失|补录|待签到/.test(question) ? "missing" : "comparison",
  };
}
