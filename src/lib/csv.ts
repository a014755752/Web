import Papa from "papaparse";
import { MAX_ROWS, recordsSchema, recordSchema, type AttendanceRecord } from "./attendance";

const columns = [
  ["eventId", "活动编号"], ["eventName", "活动名称"], ["date", "日期"],
  ["category", "活动类型"], ["channel", "渠道"], ["registered", "报名人数"], ["attended", "到场人数"],
] as const;

function parseCount(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export function readCsv(source: string): { rows: AttendanceRecord[]; issues: string[] } {
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    transform: (value) => value.trim(),
    preview: MAX_ROWS + 1,
  });

  const headers = new Set(parsed.meta.fields);
  const missing = columns.filter(([field, title]) => !headers.has(field) && !headers.has(title));
  if (missing.length) return { rows: [], issues: [`缺少列 ${missing.map(([, title]) => title).join("、")}`] };
  if (parsed.meta.renamedHeaders && Object.keys(parsed.meta.renamedHeaders).length) {
    return { rows: [], issues: ["CSV 表头包含重复列"] };
  }
  if (parsed.data.length > MAX_ROWS) return { rows: [], issues: [`每份 CSV 最多 ${MAX_ROWS} 条记录`] };
  if (parsed.errors.length) {
    return { rows: [], issues: parsed.errors.slice(0, 5).map((error) => `第 ${(error.row ?? 0) + 2} 行格式异常`) };
  }

  const rows: AttendanceRecord[] = [];
  const issues: string[] = [];
  for (const [index, input] of parsed.data.entries()) {
    const row = Object.fromEntries(columns.map(([field, title]) => [field, input[field] ?? input[title]]));
    const result = recordSchema.safeParse({
      ...row,
      registered: parseCount(row.registered),
      attended: row.attended ? parseCount(row.attended) : null,
    });
    if (result.success) rows.push(result.data);
    else {
      const issue = result.error.issues[0];
      const title = columns.find(([field]) => field === issue.path[0])?.[1] ?? "数据";
      issues.push(`第 ${index + 2} 行${title}有误${issue.code === "custom" ? `。${issue.message}` : ""}`);
    }
  }

  if (issues.length) return { rows: [], issues: issues.slice(0, 6) };
  const result = recordsSchema.safeParse(rows);
  if (!result.success) {
    if (!rows.length) return { rows: [], issues: ["CSV 中没有活动记录"] };
    return { rows: [], issues: result.error.issues.slice(0, 6).map((issue) => `第 ${Number(issue.path[0]) + 2} 行${issue.message}`) };
  }
  return { rows, issues: [] };
}

export function writeCsv(rows: AttendanceRecord[]) {
  return "\uFEFF" + Papa.unparse({
    fields: columns.map(([, title]) => title),
    data: rows.map((row) => columns.map(([field]) => row[field] ?? "")),
  }, { escapeFormulae: true });
}
