import type { TranslationProgress } from "../translator/types.js";

const jobs = new Map<number, TranslationProgress>();

export function getJobProgress(
  chapterId: number
): TranslationProgress | undefined {
  return jobs.get(chapterId);
}

export function setJobProgress(
  chapterId: number,
  progress: TranslationProgress
): void {
  jobs.set(chapterId, progress);
}

export function removeJob(chapterId: number): void {
  jobs.delete(chapterId);
}
