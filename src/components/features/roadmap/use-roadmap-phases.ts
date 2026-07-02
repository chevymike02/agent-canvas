import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AUTOMATION_RUNS_QUERY_KEY } from "#/hooks/query/use-automation-detail";
import { useAutomations } from "#/hooks/query/use-automations";
import {
  AutomationRunStatus,
  type AutomationRun,
  type AutomationRunsResponse,
} from "#/types/automation";
import { buildPhases, type Phase } from "./build-phases";

// Must match `useAutomationRuns`'s defaults exactly (src/hooks/query/use-automation-detail.ts)
// so the two hooks share one cache entry per automation instead of issuing
// duplicate requests with different keys.
const RUNS_LIMIT = 20;
const RUNS_OFFSET = 0;

export interface UseRoadmapPhasesResult {
  phases: Phase[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Feed the roadmap timeline with the app's REAL automation data.
 *
 * Pulls automations via the shared `useAutomations` query, then fetches each
 * automation's runs in parallel with `useQueries` (mirroring the query key +
 * queryFn of `useAutomationRuns` — a fixed hook can't be called once per
 * automation because the list length is dynamic). The runs are grouped by
 * automation id and handed to the pure `buildPhases` seam, which owns all
 * automation → phase mapping.
 */
export function useRoadmapPhases(): UseRoadmapPhasesResult {
  const active = useActiveBackend();
  const automationsQuery = useAutomations();
  const automations = useMemo(
    () => automationsQuery.data?.automations ?? [],
    [automationsQuery.data],
  );

  const runsQueries = useQueries({
    queries: automations.map((automation) => ({
      // Key shape (incl. {limit, offset}) and queryFn mirror useAutomationRuns
      // exactly so the roadmap shares its cache entry with the detail page.
      queryKey: [
        ...AUTOMATION_RUNS_QUERY_KEY,
        automation.id,
        { limit: RUNS_LIMIT, offset: RUNS_OFFSET },
        active.backend.id,
        active.orgId,
      ] as const,
      queryFn: () =>
        AutomationService.getAutomationRuns(
          automation.id,
          RUNS_LIMIT,
          RUNS_OFFSET,
        ),
      staleTime: 60 * 1000,
      enabled: Boolean(automation.id),
      // Poll while any run is non-terminal so status transitions
      // (RUNNING -> COMPLETED/FAILED) show up without a manual refresh.
      refetchInterval: (query: { state: { data: unknown } }) => {
        const data = query.state.data as AutomationRunsResponse | undefined;
        if (!data) return false;
        const hasInFlightRun = data.runs.some(
          (run) =>
            run.status === AutomationRunStatus.PENDING ||
            run.status === AutomationRunStatus.RUNNING,
        );
        return hasInFlightRun ? 3000 : false;
      },
    })),
  });

  // `useQueries` returns a fresh array every render, so it can't sit in a memo
  // dependency list (see @tanstack/query/no-unstable-deps). Build the run map
  // inline each render — like `useBackendsHealth` does — and gate the only
  // expensive step (`buildPhases`) on a stable signature that changes only when
  // the underlying run data actually updates.
  const runsByAutomationId: Record<string, AutomationRun[]> = {};
  automations.forEach((automation, index) => {
    runsByAutomationId[automation.id] = runsQueries[index]?.data?.runs ?? [];
  });

  const runsSignature = runsQueries
    .map((query) => query.dataUpdatedAt)
    .join(",");

  const phases = useMemo(
    () => buildPhases(automations, runsByAutomationId),
    [automations, runsSignature],
  );

  const isRunsLoading = runsQueries.some((query) => query.isLoading);
  const isRunsError = runsQueries.some((query) => query.isError);

  const refetch = () => {
    void automationsQuery.refetch();
    runsQueries.forEach((query) => {
      void query.refetch();
    });
  };

  return {
    phases,
    isLoading: automationsQuery.isLoading || isRunsLoading,
    isError: automationsQuery.isError || isRunsError,
    refetch,
  };
}
