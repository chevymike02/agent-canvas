import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AUTOMATION_RUNS_QUERY_KEY } from "#/hooks/query/use-automation-detail";
import { useAutomations } from "#/hooks/query/use-automations";
import type { AutomationRun } from "#/types/automation";
import { buildPhases, type Phase } from "./build-phases";

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
      queryKey: [
        ...AUTOMATION_RUNS_QUERY_KEY,
        automation.id,
        active.backend.id,
        active.orgId,
      ] as const,
      queryFn: () => AutomationService.getAutomationRuns(automation.id),
      staleTime: 60 * 1000,
      enabled: Boolean(automation.id),
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
