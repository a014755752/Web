import { defaultCriteria, type AnalysisScope, type Criteria } from "./attendance";

export type ClubRule = {
  id: string;
  title: string;
  version: string;
  category: string | null;
  from: string;
  through: string | null;
  text: string;
  criteria: Criteria | null;
  keywords: string[];
};

export const clubRules: ClubRule[] = [
  {
    id: "general-2026", title: "秋季活动复盘口径", version: "v2.0", category: null,
    from: "2026-09-01", through: null, criteria: defaultCriteria,
    text: "按宣传渠道对比时，使用有签到记录批次的到场总数除以对应报名总数。每组有效报名至少 20 人，签到覆盖率至少达到 80%。满足条件的组达到两组时，优先核查到场率较低的一组。",
    keywords: ["复盘", "渠道", "到场率", "门槛", "通用", "通常", "秋季"],
  },
  {
    id: "recruitment-2026", title: "招新专场复盘口径", version: "v1.1", category: "招新",
    from: "2026-09-01", through: null, criteria: { minSamples: 30, minCoverage: 0.9 },
    text: "只分析招新活动时，应用招新专场口径。单组有效报名至少 30 人，签到覆盖率至少 90%，再比较各渠道的到场率。查看全类型活动时采用秋季通用口径。",
    keywords: ["招新", "社团招募", "拉新", "专场", "新成员", "宣传"],
  },
  {
    id: "checkin-2026", title: "签到数据补录说明", version: "v1.0", category: null,
    from: "2026-09-01", through: null, criteria: null,
    text: "先核对活动编号和来源渠道，再录入截图中的已签到人数。签到数据覆盖率等于有到场记录的报名人数除以全部报名人数。空值表示待补录，0 表示已核对且无人到场。",
    keywords: ["补录", "签到", "缺失", "覆盖", "截图", "缺口", "空值"],
  },
  {
    id: "channels-2026", title: "宣传渠道归属说明", version: "v1.0", category: null,
    from: "2026-09-01", through: null, criteria: null,
    text: "活动编号与渠道共同标识一条汇总记录。按报名时记录的主渠道归属，同一报名者在一次活动中只计入一个渠道。",
    keywords: ["归属", "重复", "班群", "海报", "公众号", "渠道记录"],
  },
  {
    id: "general-2025", title: "春夏活动复盘口径（历史）", version: "v1.0", category: null,
    from: "2025-01-01", through: "2026-08-31", criteria: { minSamples: 10, minCoverage: 0.7 },
    text: "历史活动的通用口径。每组有效报名至少 10 人，签到覆盖率至少 70%。适用于 2026 年 8 月 31 日及以前的复盘范围。",
    keywords: ["复盘", "渠道", "到场率", "门槛", "通用", "历史"],
  },
];

export function activeRules(scope: AnalysisScope) {
  const date = scope.to ?? scope.from ?? "2026-11-15";
  return clubRules.filter((rule) => (
    rule.from <= date &&
    (!rule.through || rule.through >= date) &&
    (rule.category === null || rule.category === scope.category)
  ));
}

export function applicableRule(scope: AnalysisScope) {
  const policies = activeRules(scope).filter((rule) => rule.criteria);
  return policies.find((rule) => rule.category !== null) ?? policies[0] ?? null;
}

export function keywordRules(question: string, scope: AnalysisScope) {
  const policy = applicableRule(scope);
  const notes = activeRules(scope).filter((rule) => !rule.criteria).map((rule) => ({
    rule,
    matches: rule.keywords.filter((keyword) => question.includes(keyword)).length,
  })).filter((item) => item.matches > 0).sort((a, b) => b.matches - a.matches);
  return [...(policy ? [policy] : []), ...notes.map(({ rule }) => rule)].slice(0, 3);
}
