import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";

export type Phase = {
  title: string;
  phaseLabel: string;
  status: "shipped" | "in-progress" | "planned";
  blurb: string;
  subs: { label: string; done: boolean }[];
  automation?: Automation;
  runs?: AutomationRun[];
  renderTiles?: RenderTile[];
};

export type RenderTile = {
  id: string;
  kind: "screenshot" | "video" | "spec";
  label: string;
  meta?: string;
  status?: "passed" | "failed" | "running";
};

const phase01RenderTiles: RenderTile[] = [
  {
    id: "backends-connected-canvas",
    kind: "screenshot",
    label: "Backends connected - Canvas",
    meta: "1440x900",
    status: "passed",
  },
];

const commandSurfaceRenderTiles: RenderTile[] = [
  {
    id: "roadmap-page-desktop",
    kind: "screenshot",
    label: "Roadmap page - desktop",
    meta: "1440x900",
    status: "passed",
  },
  {
    id: "roadmap-page-mobile",
    kind: "screenshot",
    label: "Roadmap page - mobile",
    meta: "390x844",
    status: "running",
  },
  {
    id: "roadmap-scroll-capture",
    kind: "video",
    label: "Roadmap scroll capture",
    meta: "42s capture",
    status: "passed",
  },
];

const automationFlowRenderTiles: RenderTile[] = [
  {
    id: "automation-builder-spec",
    kind: "spec",
    label: "Automation builder spec",
    meta: "rendered mdx",
    status: "passed",
  },
  {
    id: "trigger-picker-browser-test",
    kind: "screenshot",
    label: "Trigger picker browser test",
    meta: "1280x900",
    status: "failed",
  },
  {
    id: "gate-config-spec-render",
    kind: "spec",
    label: "Gate config spec render",
    meta: "a11y + browser",
    status: "running",
  },
];

/**
 * Build the roadmap phase timeline from the app's real automation data.
 *
 * Runs arrive grouped by automation id (`runsByAutomationId`) because the
 * backend has no flat "all runs" endpoint — each automation's runs are
 * fetched via `AutomationService.getAutomationRuns(id)`. The real
 * `AutomationRun` type therefore carries no `automation_id`; the grouping is
 * the source of truth for which automation a run belongs to.
 */
export function buildPhases(
  sourceAutomations: Automation[],
  runsByAutomationId: Record<string, AutomationRun[]>,
): Phase[] {
  const allRuns = Object.values(runsByAutomationId).flat();
  const completedRuns = allRuns.filter(
    (run) => run.status === AutomationRunStatus.COMPLETED,
  ).length;
  const runningRuns = allRuns.some(
    (run) => run.status === AutomationRunStatus.RUNNING,
  );
  const failedRuns = allRuns.some(
    (run) => run.status === AutomationRunStatus.FAILED,
  );
  const findAutomation = (nameFragment: string) =>
    sourceAutomations.find((automation) =>
      automation.name.toLowerCase().includes(nameFragment),
    );
  const runsForAutomation = (
    automation: Automation | undefined,
    status: AutomationRunStatus,
  ) =>
    automation
      ? (runsByAutomationId[automation.id] ?? []).filter(
          (run) => run.status === status,
        )
      : [];

  const inventoryAutomation = findAutomation("inventory");
  const roadmapAutomation = findAutomation("roadmap");
  const flowGalleryAutomation = findAutomation("flow gallery");
  const inventoryRuns = runsForAutomation(
    inventoryAutomation,
    AutomationRunStatus.COMPLETED,
  );
  const roadmapRuns = runsForAutomation(
    roadmapAutomation,
    AutomationRunStatus.RUNNING,
  );
  const flowGalleryRuns = runsForAutomation(
    flowGalleryAutomation,
    AutomationRunStatus.FAILED,
  );

  const withAutomation = (
    phase: Phase,
    automation: Automation | undefined,
    phaseRuns: AutomationRun[],
  ): Phase => (automation ? { ...phase, automation, runs: phaseRuns } : phase);

  return [
    withAutomation(
      {
        title: "Fleet & memory foundation",
        phaseLabel: "Phase 01",
        status: completedRuns >= 2 ? "shipped" : "in-progress",
        blurb:
          "Seven machines on the tailnet, native agent-servers, the memory brain over pgvector. The substrate the team runs on.",
        subs: [
          { label: "4 backends connected in Canvas", done: completedRuns >= 1 },
          { label: "AMP memory API live", done: completedRuns >= 2 },
        ],
        renderTiles: phase01RenderTiles,
      },
      inventoryAutomation,
      inventoryRuns,
    ),
    withAutomation(
      {
        title: "Crew orchestration",
        phaseLabel: "Phase 02",
        status: completedRuns >= 2 ? "shipped" : "in-progress",
        blurb:
          "Codex, Grok, and Antigravity behind one gateway — delegate builds, reviews, and live research off the paid loop.",
        subs: [
          { label: "Gateway dispatch + polling", done: completedRuns >= 1 },
          { label: "Adversarial review pattern", done: completedRuns >= 2 },
        ],
      },
      inventoryAutomation,
      inventoryRuns,
    ),
    withAutomation(
      {
        title: "The command surface",
        phaseLabel: "Phase 03",
        status:
          runningRuns || Boolean(roadmapAutomation) ? "in-progress" : "planned",
        blurb:
          "A rebuilt Agent Canvas front-end — this roadmap, flow galleries, and rendered spec files, on a higher-quality stack.",
        subs: [
          {
            label: "Component inventory (480 mapped)",
            done: Boolean(inventoryAutomation),
          },
          { label: "Roadmap page (you're looking at it)", done: false },
          { label: "Flow / browser-test gallery", done: false },
        ],
        renderTiles: commandSurfaceRenderTiles,
      },
      roadmapAutomation,
      roadmapRuns,
    ),
    withAutomation(
      {
        title: "Customizable automation flows",
        phaseLabel: "Phase 04",
        status:
          failedRuns || Boolean(flowGalleryAutomation)
            ? "in-progress"
            : "planned",
        blurb:
          "Define your own pipelines — pick the trigger (issue opened, PR, schedule), chain the agent steps, set the gates. Lock agents into a DevOps flow you control.",
        subs: [
          {
            label: "Trigger picker (issue / PR / cron / webhook)",
            done: false,
          },
          { label: "Step builder (build -> review -> PR)", done: false },
          { label: "Gate config (a11y / security / browser)", done: false },
        ],
        renderTiles: automationFlowRenderTiles,
      },
      flowGalleryAutomation,
      flowGalleryRuns,
    ),
    {
      title: "Near-autonomous delivery",
      phaseLabel: "Phase 05",
      status: "planned",
      blurb:
        "Recorded user-flows on every deploy, self-healing test runs, the team shipping HEXIS work with a human only at the gates.",
      subs: [],
    },
  ];
}
