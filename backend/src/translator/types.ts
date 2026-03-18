export interface TranslationEntry {
  original: string;
  translated: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type: "bubble" | "sfx" | "narration";
  shape: "ellipse" | "rectangle" | "cloud";
}

export interface TranslationResult {
  imageIndex: number;
  imageUrl: string;
  entries: TranslationEntry[];
}

export interface TranslationProgress {
  chapterId: number;
  total: number;
  completed: number;
  status: "pending" | "translating" | "done" | "error";
  error?: string;
}
