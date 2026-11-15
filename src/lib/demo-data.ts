import type { AttendanceRecord } from "./attendance";

export const demoRecords: AttendanceRecord[] = [
  { eventId: "A01", eventName: "新生交流会", date: "2026-10-10", category: "分享会", channel: "公众号", registered: 30, attended: 20 },
  { eventId: "A02", eventName: "桌游体验日", date: "2026-10-17", category: "工作坊", channel: "公众号", registered: 20, attended: null },
  { eventId: "A03", eventName: "校园游园会", date: "2026-10-24", category: "招新", channel: "班群", registered: 60, attended: 48 },
  { eventId: "A03", eventName: "校园游园会", date: "2026-10-24", category: "招新", channel: "海报", registered: 8, attended: 3 },
];

const categoryNames = ["分享会", "招新", "工作坊"] as const;
const titlePrefixes = ["社团经验交流", "社团见面日", "动手体验课"] as const;
const channels = ["班群", "公众号", "海报", "社群邀请"] as const;

export function semesterRecords(): AttendanceRecord[] {
  let seed = 20261115;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  return Array.from({ length: 25 }, (_, index) => {
    const type = index % categoryNames.length;
    const event = {
      eventId: `S${String(index + 1).padStart(2, "0")}`,
      eventName: `${titlePrefixes[type]} ${index + 1}`,
      date: new Date(Date.UTC(2026, 8, 3 + index * 3)).toISOString().slice(0, 10),
      category: categoryNames[type],
    };

    return [0, 1, 2].map((offset) => {
      const channel = channels[(index + offset) % channels.length];
      const registered = 8 + Math.floor(random() * 53);
      const attended = (index + offset) % 13 === 6
        ? null
        : Math.round(registered * (0.35 + 0.57 * random()));
      return { ...event, channel, registered, attended };
    });
  }).flat();
}
