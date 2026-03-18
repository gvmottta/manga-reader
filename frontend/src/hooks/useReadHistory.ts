import { useState } from "react";

const STORAGE_KEY = "manga-reader:read-history";

type ReadHistory = Record<string, { comicId: number; readAt: string }>;

function readFromStorage(): ReadHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReadHistory) : {};
  } catch {
    return {};
  }
}

function writeToStorage(history: ReadHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore (iOS private mode quota)
  }
}

export function useReadHistory() {
  const [history, setHistory] = useState<ReadHistory>(readFromStorage);

  function markAsRead(chapterId: number, comicId: number) {
    setHistory((prev) => {
      const next = {
        ...prev,
        [String(chapterId)]: { comicId, readAt: new Date().toISOString() },
      };
      writeToStorage(next);
      return next;
    });
  }

  function isRead(chapterId: number): boolean {
    return String(chapterId) in history;
  }

  function getLastReadChapterId(comicId: number): number | null {
    let lastId: number | null = null;
    let lastDate = "";
    for (const [idStr, entry] of Object.entries(history)) {
      if (entry.comicId === comicId && entry.readAt > lastDate) {
        lastDate = entry.readAt;
        lastId = Number(idStr);
      }
    }
    return lastId;
  }

  return { markAsRead, isRead, getLastReadChapterId };
}
