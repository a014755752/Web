import { defaultCriteria, type AnalysisScope, type AttendanceRecord, type Criteria } from "./attendance";
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
};

export type AnalysisStep = { name: string; detail: string };

export type AnalysisEvent =
  | { type: "step"; step: AnalysisStep }
  | { type: "result"; run: AnalysisRun }
  | { type: "error"; message: string };

export type AnalysisInput = {
  question: string;
  rows: AttendanceRecord[];
  scope: AnalysisScope;
  useRules: boolean;
};

export const promptExamples = [
  { label: "比较渠道表现", question: "按社团复盘规则，哪个宣传渠道值得优先复盘？" },
  { label: "找出签到缺口", question: "找出需要补录的签到记录。" },
  { label: "按活动类型分析", question: "按活动类型分组，比较各类型的报名和到场情况。" },
];

function matchingValue(question: string, choices: string[]) {
  const matches = [...new Set(choices)].filter((item) => question.includes(item));
  return matches.length === 1 ? matches[0] : null;
}

export function runLocalAnalysis({ question, rows, scope, useRules }: AnalysisInput): AnalysisRun {
  const nextScope = { ...scope };
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
  nextScope.category = matchingValue(question, rows.map((row) => row.category)) ?? scope.category;
  nextScope.channel = matchingValue(question, rows.map((row) => row.channel)) ?? scope.channel;
  const rule = useRules ? applicableRule(nextScope) : null;
  return {
    mode: "local",
    scope: nextScope,
    criteria: rule?.criteria ?? defaultCriteria,
    ruleId: rule?.id ?? null,
    sources: useRules ? keywordRules(question, nextScope).map(({ id }) => id) : [],
    retrieval: useRules ? "keyword" : "off",
    focus: /缺口|缺失|补录|待签到/.test(question) ? "missing" : "comparison",
  };
}
