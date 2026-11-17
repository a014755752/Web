import type { AttendanceRecord } from "./attendance";

export type Attachment = { name: string; url: string };
export type Attachments = Record<string, Attachment>;

export type WorkspaceLedger = {
  revision: number;
  title: string;
  rows: AttendanceRecord[];
  attachments: Attachments;
};

const storeName = "ledgers";
const ledgerKey = "current";
const conversationPrefix = "conversation:";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("campus-review-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLedger() {
  const database = await openDatabase();
  try {
    return await new Promise<WorkspaceLedger | undefined>((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(ledgerKey);
      request.onsuccess = () => resolve(request.result as WorkspaceLedger | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function writeLedger(ledger: WorkspaceLedger) {
  const database = await openDatabase();
  const next = { ...ledger, revision: ledger.revision + 1 };
  try {
    return await new Promise<WorkspaceLedger>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      let conflict = false;
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(new Error(conflict
        ? "台账已在其他窗口更新，请刷新后重试。"
        : "无法保存台账，请检查浏览器存储空间后重试。"));
      const request = store.get(ledgerKey);
      request.onsuccess = () => {
        const saved = request.result as WorkspaceLedger | undefined;
        conflict = (saved?.revision ?? 0) !== ledger.revision;
        if (conflict) transaction.abort();
        else store.put(next, ledgerKey);
      };
    });
  } finally {
    database.close();
  }
}

export async function readConversations<T>() {
  const database = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const range = IDBKeyRange.bound(conversationPrefix, `${conversationPrefix}\uffff`);
      const request = database.transaction(storeName).objectStore(storeName).getAll(range);
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function writeConversation<T extends {
  id: string; updatedAt: number; turns: { id: string; startedAt?: number; updatedAt?: number }[];
}>(conversation: T) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      const store = transaction.objectStore(storeName);
      const key = conversationPrefix + conversation.id;
      const request = store.get(key);
      request.onsuccess = () => {
        const previous = request.result as T | undefined;
        if (!previous) {
          store.put(conversation, key);
          return;
        }
        const turns = new Map(previous.turns.map((turn) => [turn.id, turn]));
        for (const turn of conversation.turns) {
          const old = turns.get(turn.id);
          if (!old || (old.updatedAt ?? 0) <= (turn.updatedAt ?? 0)) turns.set(turn.id, turn);
        }
        store.put({
          ...conversation, updatedAt: Math.max(conversation.updatedAt, previous.updatedAt),
          turns: [...turns.values()].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0)),
        }, key);
      };
    });
  } finally {
    database.close();
  }
}
