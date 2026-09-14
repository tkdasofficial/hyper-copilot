/** Client-safe types for the background job queue. */

export type JobKind =
  | "image"
  | "video"
  | "speech"
  | "music"
  | "virtual-model"
  | "character-image";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export type JobResult = {
  /** Row id in `generations` (or `virtual_models` for character profiles). */
  id?: string;
  /** Freshly signed URL of the finished asset, when the job produced a file. */
  url?: string | null;
  kind?: string;
};

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  label: string;
  attempts: number;
  error: string | null;
  result: JobResult | null;
  createdAt: string;
  finishedAt: string | null;
};

export const ACTIVE_JOB_STATUSES: JobStatus[] = ["queued", "running"];

export function isTerminal(status: JobStatus) {
  return status === "completed" || status === "failed" || status === "canceled";
}

/** Short human label used in the tasks panel. */
export function jobKindLabel(kind: JobKind) {
  switch (kind) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "speech":
      return "Speech";
    case "music":
      return "Music";
    case "virtual-model":
      return "Character profile";
    case "character-image":
      return "Character image";
    default:
      return "Task";
  }
}
