import { type RenderTile } from "./build-phases";

/**
 * Fleet SeaweedFS filer that holds captured roadmap media
 * (browser-flow screenshots, scroll videos, AI design renders).
 * Layout is `/roadmap/<automationId>/<runId>/<asset>` — see the fleet media
 * storage + agent-systems contract. Reachable over the Tailscale tailnet.
 */
const FILER_BASE = "http://seaweedfs-filer.tailb628c5.ts.net:8888";

/**
 * One displayable media asset from a run folder. Mirrors the shape of a
 * placeholder `RenderTile` (so the tiles read the same) but carries the real
 * asset `url` and the concrete `mediaType` used to pick `<img>` vs `<video>`.
 */
export type RunMediaItem = {
  id: string;
  kind: RenderTile["kind"];
  mediaType: "image" | "video";
  url: string;
  label: string;
  meta?: string;
};

/**
 * A single entry in a SeaweedFS filer directory listing. Only the fields we
 * read are typed; the listing carries many more (Mtime, Mode, Md5, ...).
 * Custom upload headers land in `Extended`, whose values JSON-encode as
 * base64 (Go marshals the underlying `map[string][]byte`).
 */
interface SeaweedEntry {
  FullPath?: string;
  Mime?: string;
  Extended?: Record<string, string> | null;
}

interface SeaweedListing {
  Path?: string;
  Entries?: SeaweedEntry[] | null;
}

/** Map the filer's `Seaweed-Kind` metadata onto our tile-kind badge. */
const SEAWEED_KIND_TO_TILE: Record<string, RenderTile["kind"]> = {
  "browser-flow": "screenshot",
  screenshot: "screenshot",
  video: "video",
  "ai-design": "spec",
  spec: "spec",
};

/**
 * Build the filer folder URL for a run's captured media. Both ids are
 * URL-encoded so opaque backend ids stay valid path segments; the trailing
 * slash is what makes the filer return a directory listing.
 */
export function buildRunFolderUrl(automationId: string, runId: string): string {
  return `${FILER_BASE}/roadmap/${encodeURIComponent(automationId)}/${encodeURIComponent(runId)}/`;
}

function readExtendedRaw(
  entry: SeaweedEntry,
  header: string,
): string | undefined {
  const ext = entry.Extended;
  if (!ext) return undefined;

  const target = header.toLowerCase();
  for (const [key, value] of Object.entries(ext)) {
    if (key.toLowerCase() === target && typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

/**
 * Extended metadata values arrive base64-encoded (Go `[]byte` -> base64 in
 * JSON). Decode when it yields clean printable ASCII; otherwise the value was
 * already plain text, so keep it as-is.
 */
function decodeMaybeBase64(value: string): string {
  try {
    const decoded = atob(value);
    if (/^[\x20-\x7e]*$/.test(decoded)) return decoded;
  } catch {
    // Not valid base64 — fall through to the raw value.
  }
  return value;
}

function readExtended(entry: SeaweedEntry, header: string): string | undefined {
  const raw = readExtendedRaw(entry, header);
  return raw === undefined ? undefined : decodeMaybeBase64(raw).trim();
}

/** Tile-kind badge for an asset: prefer `Seaweed-Kind`, fall back to MIME. */
function resolveKind(entry: SeaweedEntry): RenderTile["kind"] {
  const seaweedKind = readExtended(entry, "Seaweed-Kind")?.toLowerCase();
  if (seaweedKind && SEAWEED_KIND_TO_TILE[seaweedKind]) {
    return SEAWEED_KIND_TO_TILE[seaweedKind];
  }

  const mime = entry.Mime?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "screenshot";
  return "spec";
}

/**
 * Concrete element to render. Returns null for anything we can't safely put in
 * an `<img>`/`<video>` (directories, rendered-mdx specs) so the caller skips it
 * instead of drawing a broken tile.
 */
function resolveMediaType(
  entry: SeaweedEntry,
  kind: RenderTile["kind"],
): "image" | "video" | null {
  const mime = entry.Mime?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  // No decodable MIME — trust the kind for the common capture types only.
  if (kind === "video") return "video";
  if (kind === "screenshot") return "image";
  return null;
}

function labelFromPath(fullPath: string): string {
  const name = fullPath.split("/").filter(Boolean).pop() ?? fullPath;
  const cleaned = name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : name;
}

/**
 * List a run's captured media from the filer. Returns the displayable assets,
 * or an empty array on any failure (unreachable filer, non-JSON body, empty
 * folder) — the common case today, since captures don't persist yet. Callers
 * fall back to the placeholder tiles on `[]`.
 */
export async function listRunMedia(
  folderUrl: string,
  signal?: AbortSignal,
): Promise<RunMediaItem[]> {
  let listing: SeaweedListing;
  try {
    const response = await fetch(folderUrl, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return [];
    listing = (await response.json()) as SeaweedListing;
  } catch {
    return [];
  }

  const entries = listing.Entries ?? [];
  const items: RunMediaItem[] = [];

  for (const entry of entries) {
    const fullPath = entry?.FullPath;
    if (typeof fullPath !== "string" || fullPath.length === 0) continue;

    const kind = resolveKind(entry);
    const mediaType = resolveMediaType(entry, kind);
    if (!mediaType) continue;

    items.push({
      id: fullPath,
      kind,
      mediaType,
      url: `${FILER_BASE}${fullPath}`,
      label: labelFromPath(fullPath),
      meta: readExtended(entry, "Seaweed-Flow"),
    });
  }

  return items;
}
