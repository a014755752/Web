import { createWorker, OEM, PSM, type Line, type Page, type Worker } from "tesseract.js";
import type { AttendanceRecord } from "./attendance";
import type { ScanResult } from "./attendance-scan";

function compact(text: string) {
  return text.normalize("NFKC").replace(/\s+/gu, "");
}

function lineTokens(line: Line) {
  let text = "";
  const words = line.words.map((word) => {
    const value = compact(word.text);
    const start = text.length;
    text += value;
    return { ...word, value, start, end: text.length };
  });
  return { text, words };
}

function attendanceCount(data: Page) {
  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap(({ lines }) => lines));
  const words = lines.flatMap((line) => line.words);
  const results = new Set<number>();

  for (const line of lines) {
    const tokens = lineTokens(line);
    for (const match of tokens.text.matchAll(/(?:[已己]签到(?:人数|数)?|实到(?:人数|数)?|实际到场(?:人数|数)?|到场人数|到场数|签到人数)/gu)) {
      const start = match.index;
      const end = start + match[0].length;
      if (/(?:预计|计划|应|未)$/u.test(tokens.text.slice(0, start))) continue;

      const inline = tokens.text.slice(end).match(/^:?(\d{1,7})(?![\d.%‰])/u);
      if (inline) {
        results.add(Number(inline[1]));
        continue;
      }
      const label = tokens.words.filter((word) => word.start < end && word.end > start);
      if (!label.length) continue;
      const left = Math.min(...label.map(({ bbox }) => bbox.x0));
      const right = Math.max(...label.map(({ bbox }) => bbox.x1));
      const top = Math.min(...label.map(({ bbox }) => bbox.y0));
      const bottom = Math.max(...label.map(({ bbox }) => bbox.y1));
      const height = Math.max(8, bottom - top);

      // In a screenshot with adjacent summary cards, use the number directly below this label.
      const candidates = words.filter(({ text, bbox, confidence }) => (
        /^\d{1,7}人?$/u.test(compact(text)) &&
        confidence >= 50 && bbox.x0 >= left - height / 2 && bbox.x0 <= right + height / 2 &&
        bbox.y0 >= bottom - 2 && bbox.y0 <= bottom + height * 3
      ));
      if (candidates.length === 1) results.add(Number(compact(candidates[0].text).replace(/人$/u, "")));
    }
  }

  const value = [...results][0];
  return results.size === 1 && value <= 1_000_000 ? value : null;
}

function parseScreenshot(data: Page, rows: AttendanceRecord[]): ScanResult {
  const lines = data.text.split(/\r?\n/u).map(compact);
  const eventIds = [...new Set(rows.map((row) => row.eventId))];
  const choices = [...new Set(rows.map((row) => row.channel))].sort((a, b) => b.length - a.length);
  const events = new Set<string>();
  const channels = new Set<string>();
  let isWholeEvent = false;

  for (const line of lines) {
    const identifier = line.match(/(?:活动编号|活动ID)[:#]?([a-z0-9_-]+)/iu)?.[1];
    const event = eventIds.find((item) => compact(item).toUpperCase() === identifier?.toUpperCase());
    if (event) events.add(event);
    for (const prefix of line.matchAll(/渠道:?/gu)) {
      const tail = line.slice(prefix.index + prefix[0].length);
      const channel = choices.find((item) => tail.startsWith(compact(item)));
      if (channel) channels.add(channel);
    }
    if (/(?:全场|整场|活动总)(?:签到|到场|汇总)/u.test(line)) isWholeEvent = true;
  }

  const channel = channels.size === 1 ? [...channels][0] : null;
  return {
    eventId: events.size === 1 ? [...events][0] : null,
    channel,
    attended: attendanceCount(data),
    scope: isWholeEvent ? "event" : channel ? "channel" : "unclear",
  };
}

export async function recognizeAttendance(file: File, rows: AttendanceRecord[], parent: AbortSignal) {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(24_000)]);
  signal.throwIfAborted();
  let worker: Worker | undefined;
  let finished = false;
  let rejectFailure: (reason: unknown) => void = () => {};
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  const abort = () => rejectFailure(signal.reason);
  signal.addEventListener("abort", abort, { once: true });

  const run = (async () => {
    const instance = await createWorker("chi_sim", OEM.LSTM_ONLY, {
      workerPath: "/ocr/worker.js",
      corePath: "/ocr",
      langPath: "/ocr",
      workerBlobURL: false,
      cachePath: "campus-review-ocr-v1",
      errorHandler: rejectFailure,
    });
    if (finished) {
      await instance.terminate();
      throw new Error("OCR 已取消");
    }
    worker = instance;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await worker.recognize(file, {}, { blocks: true });
    return parseScreenshot(data, rows);
  })();

  try {
    return await Promise.race([run, failure]);
  } finally {
    finished = true;
    signal.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
