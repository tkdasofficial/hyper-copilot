import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Download,
  Search,
  Trash2,
  ImageIcon,
  Video,
  AudioLines,
  PenTool,
  Play,
  Film,
  ExternalLink,
  X,
  Loader2,
  CheckCircle2,
  Clapperboard,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { cn } from "@/lib/utils";
import { deleteGeneration, listGenerations } from "@/lib/generation.functions";
import { useSession } from "@/hooks/useSession";

type AssetKind = "Image" | "Video" | "Audio" | "Vector";

interface AssetRecord {
  id: string;
  kind: AssetKind;
  prompt: string;
  src: string | null;
  meta: string;
  date: string;
  status: string;
  fileId?: string | null;
  directDownloadUrl?: string | null;
}

interface DownloadStatus {
  active: boolean;
  title: string;
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  completed: boolean;
  error?: string | null;
}

export const Route = createFileRoute("/library")({
  head: () =>
    pageHead({
      path: "/library",
      title: "Library — Manage Your AI Generations | Hyper Copilot",
      description:
        "Browse, search, download and preview every image, video, audio and vector asset generated in Hyper Copilot.",
      noindex: true,
      keywords: [
        "AI generation library",
        "AI asset manager",
        "download AI images",
        "AI media history",
      ],
    }),
  component: LibraryPage,
});

const kindIcon: Record<AssetKind, typeof ImageIcon> = {
  Image: ImageIcon,
  Video: Video,
  Audio: AudioLines,
  Vector: PenTool,
};

const filters = ["All", "Video", "Image", "Audio", "Vector"] as const;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(title: string): string {
  const clean = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return clean || "rendered-video";
}

function LibraryPage() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");

  // Video interaction states
  const [selectedVideoForOptions, setSelectedVideoForOptions] = useState<AssetRecord | null>(null);
  const [previewVideo, setPreviewVideo] = useState<AssetRecord | null>(null);
  const [isPreviewBuffering, setIsPreviewBuffering] = useState(true);

  // Download notification bar state
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>({
    active: false,
    title: "",
    percent: 0,
    loadedBytes: 0,
    totalBytes: 0,
    completed: false,
  });

  const activeDownloadXhr = useRef<XMLHttpRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["generations", "library"],
    queryFn: () => listGenerations({ data: { limit: 200 } }),
    enabled: Boolean(session),
  });

  const assets: AssetRecord[] = useMemo(
    () =>
      (data ?? []).map((g) => ({
        id: g.id,
        kind: (g.kind === "video" ? "Video" : g.kind === "audio" ? "Audio" : "Image") as AssetKind,
        prompt: g.prompt,
        src: g.url,
        meta: g.model,
        date: new Date(g.createdAt).toLocaleDateString(),
        status: g.status,
        fileId: g.fileId,
        directDownloadUrl: g.directDownloadUrl || g.url,
      })),
    [data],
  );

  const remove = useMutation({
    mutationFn: (id: string) => deleteGeneration({ data: { id } }),
    onSuccess: () => {
      toast.success("Asset removed from library");
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
      if (selectedVideoForOptions) setSelectedVideoForOptions(null);
      if (previewVideo) setPreviewVideo(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete"),
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter(
      (a) => (filter === "All" || a.kind === filter) && (!q || a.prompt.toLowerCase().includes(q)),
    );
  }, [assets, filter, query]);

  // Start real tracked download with notification bar
  const startDownloadWithProgress = (asset: AssetRecord) => {
    const downloadUrl = asset.directDownloadUrl || asset.src;
    if (!downloadUrl) {
      toast.error("Video file is not available yet.");
      return;
    }

    const filename = `${sanitizeFilename(asset.prompt)}.mp4`;

    // Abort previous download if any
    if (activeDownloadXhr.current) {
      activeDownloadXhr.current.abort();
    }

    setDownloadStatus({
      active: true,
      title: asset.prompt,
      percent: 0,
      loadedBytes: 0,
      totalBytes: 0,
      completed: false,
      error: null,
    });

    const xhr = new XMLHttpRequest();
    activeDownloadXhr.current = xhr;

    xhr.open("GET", downloadUrl, true);
    xhr.responseType = "blob";

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        setDownloadStatus((prev) => ({
          ...prev,
          percent,
          loadedBytes: event.loaded,
          totalBytes: event.total,
        }));
      } else {
        setDownloadStatus((prev) => ({
          ...prev,
          loadedBytes: event.loaded,
        }));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob;
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);

        const totalSize = blob.size || xhr.getResponseHeader("content-length");
        setDownloadStatus((prev) => ({
          ...prev,
          percent: 100,
          completed: true,
          loadedBytes: blob.size,
          totalBytes: totalSize ? Number(totalSize) : blob.size,
        }));

        toast.success(`Download complete: ${filename}`);

        setTimeout(() => {
          setDownloadStatus((prev) => (prev.completed ? { ...prev, active: false } : prev));
        }, 4500);
      } else {
        // Direct browser fallback if CORS blocked binary blob
        triggerDirectDownloadFallback(downloadUrl, filename);
      }
    };

    xhr.onerror = () => {
      // Direct browser fallback if CORS blocked binary blob
      triggerDirectDownloadFallback(downloadUrl, filename);
    };

    xhr.send();
  };

  const triggerDirectDownloadFallback = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadStatus((prev) => ({
      ...prev,
      percent: 100,
      completed: true,
    }));
    toast.success(`Download started: ${filename}`);

    setTimeout(() => {
      setDownloadStatus((prev) => (prev.completed ? { ...prev, active: false } : prev));
    }, 3500);
  };

  const cancelDownload = () => {
    if (activeDownloadXhr.current) {
      activeDownloadXhr.current.abort();
      activeDownloadXhr.current = null;
    }
    setDownloadStatus((prev) => ({ ...prev, active: false }));
    toast("Download canceled");
  };

  const openPreview = (asset: AssetRecord) => {
    setIsPreviewBuffering(true);
    setPreviewVideo(asset);
    setSelectedVideoForOptions(null);
  };

  return (
    <StudioLayout>
      <div className="mx-auto w-full max-w-6xl space-y-5 pb-24">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Library</h1>
          <p className="text-[13px] text-muted-foreground">
            All your generated videos, images, and audio in one place. Renders automatically save
            here.
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-muted-foreground">
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <input
              aria-label="Search library"
              placeholder="Search your generations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  filter === f
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface/30 p-16 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            <p className="mt-3 text-[13px] font-medium text-muted-foreground">Loading library...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted-foreground">
              <Film className="h-6 w-6" />
            </div>
            <p className="text-[14px] font-semibold">
              {assets.length === 0 ? "Your library is empty" : "No matching assets found"}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {assets.length === 0
                ? "Start a render in Video Agent or generate assets to see them appear here."
                : "Try a different search or filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((a) => {
              const Icon = kindIcon[a.kind];
              const isVideo = a.kind === "Video";

              return (
                <article
                  key={a.id}
                  className="group overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-200 hover:border-border-strong hover:shadow-lg hover:shadow-black/20"
                >
                  {/* Media Visual Area */}
                  {isVideo ? (
                    /* Ruf (Video) Icon Card View - Tapping opens options */
                    <button
                      type="button"
                      onClick={() => setSelectedVideoForOptions(a)}
                      className="relative block aspect-square w-full cursor-pointer overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-left transition-transform group-hover:scale-[1.01]"
                    >
                      {/* Stylized ruf/rough video icon plate */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                        <div className="relative mb-2 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:border-primary/40 group-hover:bg-primary/10">
                          <Clapperboard className="h-8 w-8 text-primary transition-transform group-hover:scale-105" />
                          <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
                              <Play className="ml-0.5 h-4 w-4 fill-current" />
                            </div>
                          </div>
                        </div>

                        <span className="text-center font-mono text-[11px] font-semibold text-zinc-400">
                          Tap for options
                        </span>
                      </div>

                      {/* Status / Type Badge */}
                      <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                        <Video className="h-3 w-3 text-primary" strokeWidth={2.5} />
                        <span>Video</span>
                      </div>

                      {a.status && a.status !== "completed" && (
                        <div className="absolute right-2.5 top-2.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                          {a.status}
                        </div>
                      )}
                    </button>
                  ) : (
                    /* Image / Audio card */
                    <div className="relative aspect-square bg-surface-2">
                      {a.src ? (
                        a.kind === "Audio" ? (
                          <div className="grid h-full w-full place-items-center p-3">
                            <audio src={a.src} controls className="w-full" />
                          </div>
                        ) : (
                          <img
                            src={a.src}
                            alt={a.prompt}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                          />
                        )
                      ) : (
                        <div className="grid h-full w-full place-items-center text-muted-foreground">
                          <Icon className="h-8 w-8" strokeWidth={1.6} />
                        </div>
                      )}
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-border-strong bg-background/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur">
                        <Icon className="h-3 w-3" strokeWidth={2} />
                        {a.kind}
                      </span>
                    </div>
                  )}

                  {/* Card Info & Actions */}
                  <div className="space-y-2 p-3">
                    <p
                      title={a.prompt}
                      className="line-clamp-2 text-[12.5px] font-medium leading-snug"
                    >
                      {a.prompt}
                    </p>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {a.meta} · {a.date}
                    </p>

                    <div className="flex items-center gap-1.5 pt-1">
                      {isVideo ? (
                        <button
                          type="button"
                          onClick={() => setSelectedVideoForOptions(a)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-surface-2"
                        >
                          <Play className="h-3 w-3 fill-current text-primary" />
                          Options
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!a.src) {
                              toast.error("This asset has no file yet.");
                              return;
                            }
                            window.open(a.src, "_blank", "noopener");
                          }}
                          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" strokeWidth={2} />
                          Download
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label="Delete asset"
                        onClick={() => remove.mutate(a.id)}
                        className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Video Options Dialog / Modal */}
      {selectedVideoForOptions ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Film className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[14.5px] font-bold">Video Options</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedVideoForOptions.meta} · {selectedVideoForOptions.date}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideoForOptions(null)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 line-clamp-2 rounded-xl bg-surface p-2.5 text-[12.5px] leading-relaxed text-muted-foreground border border-border/60">
              "{selectedVideoForOptions.prompt}"
            </p>

            <div className="mt-4 space-y-2">
              {/* Preview Option */}
              <button
                type="button"
                onClick={() => openPreview(selectedVideoForOptions)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3 text-left transition-all hover:border-border-strong hover:bg-surface-2"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Preview Video</p>
                    <p className="text-[11px] text-muted-foreground">
                      Start temporary download stream to play video
                    </p>
                  </div>
                </div>
                <span className="text-[11.5px] font-bold text-primary">Watch →</span>
              </button>

              {/* Download Option */}
              <button
                type="button"
                onClick={() => {
                  const target = selectedVideoForOptions;
                  setSelectedVideoForOptions(null);
                  startDownloadWithProgress(target);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3 text-left transition-all hover:border-border-strong hover:bg-surface-2"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground/10 text-foreground">
                    <Download className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Download Video</p>
                    <p className="text-[11px] text-muted-foreground">
                      Save to disk with live progress bar & size (MB/GB)
                    </p>
                  </div>
                </div>
                <span className="text-[11.5px] font-semibold text-muted-foreground">Save</span>
              </button>

              {/* Google Drive Link (Headless background service metadata) */}
              {selectedVideoForOptions.fileId ? (
                <a
                  href={`https://drive.google.com/file/d/${selectedVideoForOptions.fileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3 text-left transition-all hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                      <HardDrive className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">Google Drive Link</p>
                      <p className="text-[11px] text-muted-foreground">
                        Stored headless in Supabase Drive integration
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              ) : null}

              {/* Delete */}
              <button
                type="button"
                onClick={() => remove.mutate(selectedVideoForOptions.id)}
                className="flex w-full items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-left transition-all hover:bg-destructive/10"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/15 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-destructive">Delete Video</p>
                    <p className="text-[11px] text-destructive/80">
                      Remove from library permanently
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Video Preview Modal with Temporary Download / Buffering Feedback */}
      {previewVideo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in">
          <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-primary" />
                <h3 className="line-clamp-1 text-[13.5px] font-bold">{previewVideo.prompt}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Video Player & Temporary Buffering Overlay */}
            <div className="relative aspect-video w-full bg-black">
              {isPreviewBuffering ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white backdrop-blur-sm">
                  <div className="relative grid h-12 w-12 place-items-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <Sparkles className="absolute h-4 w-4 text-primary animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[13px] font-bold tracking-tight">
                      Temporary download started to show preview…
                    </p>
                    <p className="text-[11.5px] text-zinc-400">
                      Streaming high-quality video playback from storage
                    </p>
                  </div>
                </div>
              ) : null}

              {previewVideo.src ? (
                <video
                  src={previewVideo.src}
                  controls
                  autoPlay
                  playsInline
                  onLoadedData={() => setIsPreviewBuffering(false)}
                  onCanPlay={() => setIsPreviewBuffering(false)}
                  onError={() => {
                    setIsPreviewBuffering(false);
                    toast.error("Error streaming video. You can still download it directly.");
                  }}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground">
                  <p className="text-[12px]">Video stream URL not found</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between border-t border-border bg-surface/50 px-4 py-3">
              <span className="text-[11.5px] text-muted-foreground">
                {previewVideo.meta} · {previewVideo.date}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = previewVideo;
                    setPreviewVideo(null);
                    startDownloadWithProgress(target);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Video
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Download Notification Bar with Live Progress % and Size (MB/GB) */}
      {downloadStatus.active ? (
        <aside
          aria-label="Download progress"
          className="fixed bottom-5 right-5 z-50 w-full max-w-sm rounded-2xl border border-border-strong bg-background/95 p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl",
                  downloadStatus.completed
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-primary/20 text-primary",
                )}
              >
                {downloadStatus.completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4 animate-bounce" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-bold">
                  {downloadStatus.completed
                    ? "Download Complete"
                    : `Downloading… ${downloadStatus.percent}%`}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{downloadStatus.title}</p>
              </div>
            </div>

            {!downloadStatus.completed ? (
              <button
                type="button"
                onClick={cancelDownload}
                className="rounded-full p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                title="Cancel download"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Progress Bar & Size Readout */}
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full transition-all duration-200",
                  downloadStatus.completed ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${downloadStatus.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10.5px] font-mono font-medium text-muted-foreground">
              <span>
                {downloadStatus.totalBytes > 0
                  ? `${formatBytes(downloadStatus.loadedBytes)} / ${formatBytes(downloadStatus.totalBytes)}`
                  : formatBytes(downloadStatus.loadedBytes)}
              </span>
              <span className="font-bold text-foreground">{downloadStatus.percent}%</span>
            </div>
          </div>
        </aside>
      ) : null}
    </StudioLayout>
  );
}
