import type { AttendanceRecord } from "./attendance";

type Activity = Pick<AttendanceRecord, "eventId" | "eventName" | "date" | "category"> & {
  attendance: [channel: string, registered: number, attended: number | null][];
};

const activities: Activity[] = [
  {
    eventId: "A04", eventName: "秋季社团开放日", date: "2026-09-05", category: "招新",
    attendance: [["公众号", 48, 36], ["海报", 25, 8], ["社群邀请", 36, 21]],
  },
  {
    eventId: "A05", eventName: "新成员见面会", date: "2026-09-12", category: "分享会",
    attendance: [["班群", 48, 41], ["公众号", 32, 23]],
  },
  {
    eventId: "A06", eventName: "手机摄影入门", date: "2026-09-13", category: "工作坊",
    attendance: [["公众号", 22, 17], ["班群", 21, 16], ["海报", 12, 6]],
  },
  {
    eventId: "A07", eventName: "社团招新咨询会", date: "2026-09-19", category: "招新",
    attendance: [["班群", 58, 46], ["公众号", 46, 31], ["海报", 20, 9]],
  },
  {
    eventId: "A08", eventName: "校园摄影采风", date: "2026-09-20", category: "工作坊",
    attendance: [["社群邀请", 24, 21], ["公众号", 29, 17]],
  },
  {
    eventId: "A09", eventName: "志愿服务经验交流", date: "2026-09-26", category: "分享会",
    attendance: [["班群", 37, 32], ["公众号", 26, 19], ["社群邀请", 16, 13]],
  },
  {
    eventId: "A10", eventName: "社团体验周", date: "2026-10-05", category: "招新",
    attendance: [["班群", 38, 28], ["社群邀请", 28, 20], ["公众号", 20, 11]],
  },
  {
    eventId: "A01", eventName: "新生交流会", date: "2026-10-10", category: "分享会",
    attendance: [["公众号", 30, 20], ["班群", 28, 22]],
  },
  {
    eventId: "A11", eventName: "校园植物观察", date: "2026-10-11", category: "工作坊",
    attendance: [["社群邀请", 16, 14], ["公众号", 15, 11]],
  },
  {
    eventId: "A02", eventName: "桌游体验日", date: "2026-10-17", category: "工作坊",
    attendance: [["公众号", 20, null], ["班群", 18, 15]],
  },
  {
    eventId: "A12", eventName: "读书会组织交流", date: "2026-10-18", category: "分享会",
    attendance: [["海报", 13, 5], ["班群", 32, 25]],
  },
  {
    eventId: "A03", eventName: "校园游园会", date: "2026-10-24", category: "招新",
    attendance: [["班群", 60, 48], ["海报", 8, 3], ["公众号", 28, 21]],
  },
  {
    eventId: "A13", eventName: "期中减压手作", date: "2026-10-31", category: "工作坊",
    attendance: [["公众号", 38, 31], ["班群", 22, 19], ["海报", 11, 4]],
  },
  {
    eventId: "A14", eventName: "跨社团协作分享会", date: "2026-11-01", category: "分享会",
    attendance: [["社群邀请", 27, 22], ["班群", 32, 26]],
  },
  {
    eventId: "A15", eventName: "校园摄影展筹备", date: "2026-11-07", category: "工作坊",
    attendance: [["班群", 21, 17], ["社群邀请", 18, 15], ["公众号", 16, null]],
  },
  {
    eventId: "A16", eventName: "秋日校园摄影展", date: "2026-11-08", category: "分享会",
    attendance: [["海报", 32, 14], ["公众号", 45, 31], ["班群", 47, 39], ["社群邀请", 24, 21]],
  },
  {
    eventId: "A17", eventName: "社团项目复盘交流", date: "2026-11-14", category: "分享会",
    attendance: [["社群邀请", 28, 24], ["班群", 34, 26], ["公众号", 29, null]],
  },
];

export const initialRecords = activities.flatMap(({ attendance, ...activity }) =>
  attendance.map(([channel, registered, attended]): AttendanceRecord => ({ ...activity, channel, registered, attended })),
);
