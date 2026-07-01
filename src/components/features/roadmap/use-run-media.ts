import { useQuery } from "@tanstack/react-query";
import { listRunMedia, type RunMediaItem } from "./media";

export const RUN_MEDIA_QUERY_KEY = ["roadmap-run-media"] as const;

/**
 * Fetch a run's captured media from the fleet filer.
 *
 * Pass `null` (no automation/run id yet) to keep the query idle. `listRunMedia`
 * swallows fetch failures and returns `[]`, so this query never surfaces an
 * error state — an empty result is the fallback signal, and the card renders
 * the placeholder tiles instead. `retry: false` keeps an unreachable filer
 * (the common case today) from retry-storming.
 */
export function useRunMedia(folderUrl: string | null) {
  return useQuery<RunMediaItem[]>({
    queryKey: [...RUN_MEDIA_QUERY_KEY, folderUrl],
    queryFn: ({ signal }) => listRunMedia(folderUrl as string, signal),
    enabled: Boolean(folderUrl),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
