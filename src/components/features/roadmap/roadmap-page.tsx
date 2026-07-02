import { useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AutomationRunStatus,
  type AutomationRun,
  type AutomationTrigger,
} from "#/types/automation";
import { I18nKey } from "#/i18n/declaration";
import { type Phase, type RenderTile } from "./build-phases";
import { buildRunFolderUrl, type RunMediaItem } from "./media";
import { useRoadmapPhases } from "./use-roadmap-phases";
import { useRunMedia } from "./use-run-media";
import { useDispatchAutomation } from "#/hooks/query/use-automations";
import { useNavigation } from "#/context/navigation-context";
import { ConfigureAutomationModal } from "./config/configure-automation-modal";
import "./roadmap.css";

const statusLabel: Record<Phase["status"], I18nKey> = {
  shipped: I18nKey.ROADMAP$STATUS_SHIPPED,
  "in-progress": I18nKey.ROADMAP$STATUS_IN_PROGRESS,
  planned: I18nKey.ROADMAP$STATUS_PLANNED,
};

const runStatusLabel: Record<AutomationRunStatus, I18nKey> = {
  [AutomationRunStatus.PENDING]: I18nKey.ROADMAP$RUN_STATUS_PENDING,
  [AutomationRunStatus.RUNNING]: I18nKey.ROADMAP$RUN_STATUS_RUNNING,
  [AutomationRunStatus.COMPLETED]: I18nKey.ROADMAP$RUN_STATUS_COMPLETED,
  [AutomationRunStatus.FAILED]: I18nKey.ROADMAP$RUN_STATUS_FAILED,
};

const renderKindLabel: Record<RenderTile["kind"], I18nKey> = {
  screenshot: I18nKey.ROADMAP$RENDER_KIND_SCREENSHOT,
  video: I18nKey.ROADMAP$RENDER_KIND_VIDEO,
  spec: I18nKey.ROADMAP$RENDER_KIND_SPEC,
};

const renderStatusLabel: Record<NonNullable<RenderTile["status"]>, I18nKey> = {
  passed: I18nKey.ROADMAP$RENDER_STATUS_PASSED,
  failed: I18nKey.ROADMAP$RENDER_STATUS_FAILED,
  running: I18nKey.ROADMAP$RENDER_STATUS_RUNNING,
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function detailIdFor(label: string) {
  return `roadmap-detail-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

function formatTrigger(trigger: AutomationTrigger, t: TFunction<"openhands">) {
  const triggerType = trigger.type.toLowerCase();

  if (triggerType === "schedule" || triggerType === "cron") {
    return (
      trigger.schedule_human ??
      trigger.schedule ??
      t(I18nKey.ROADMAP$TRIGGER_SCHEDULED)
    );
  }

  if (triggerType === "event" || triggerType === "webhook") {
    const onValue = Array.isArray(trigger.on)
      ? trigger.on.join(", ")
      : trigger.on;
    return [
      trigger.source,
      onValue ? `on ${onValue}` : null,
      trigger.filter ? `filter ${trigger.filter}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (triggerType === "manual") {
    return t(I18nKey.ROADMAP$TRIGGER_MANUAL);
  }

  return trigger.type;
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatRunDuration(run: AutomationRun, t: TFunction<"openhands">) {
  if (!run.completed_at) {
    return t(I18nKey.ROADMAP$RUN_DURATION_RUNNING);
  }

  const elapsedMs = Math.max(
    0,
    new Date(run.completed_at).getTime() - new Date(run.started_at).getTime(),
  );
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function RenderTilesBlock({
  headingId,
  tiles,
}: {
  headingId: string;
  tiles: RenderTile[];
}) {
  const { t } = useTranslation("openhands");

  return (
    <section className="roadmap-render-block" aria-labelledby={headingId}>
      <h3 className="roadmap-render-heading" id={headingId}>
        {t(I18nKey.ROADMAP$RENDERS_AND_BROWSER_TESTS)}
      </h3>
      <div className="roadmap-render-grid">
        {tiles.map((tile) => {
          const statusClass = tile.status ? ` status-${tile.status}` : "";
          const statusLabelKey = tile.status
            ? renderStatusLabel[tile.status]
            : null;
          const ariaMeta = [
            tile.meta,
            statusLabelKey ? t(statusLabelKey) : null,
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <button
              aria-label={`${t(renderKindLabel[tile.kind])}: ${tile.label}${ariaMeta ? `, ${ariaMeta}` : ""}`}
              className={`roadmap-render-tile kind-${tile.kind}${statusClass}`}
              key={tile.id}
              type="button"
            >
              <span className="roadmap-render-visual" aria-hidden="true">
                <span className="roadmap-render-glyph" />
                {tile.kind === "video" ? (
                  <span className="roadmap-render-play" />
                ) : null}
              </span>
              <span className="roadmap-render-copy">
                <span className="roadmap-render-kind">
                  {t(renderKindLabel[tile.kind])}
                </span>
                <span className="roadmap-render-label">{tile.label}</span>
                {tile.meta || statusLabelKey ? (
                  <span className="roadmap-render-meta">
                    {tile.meta ? <span>{tile.meta}</span> : null}
                    {tile.status === "running" ? (
                      <span className="roadmap-render-status">
                        {t(I18nKey.ROADMAP$RENDER_STATUS_RUNNING)}
                      </span>
                    ) : statusLabelKey ? (
                      <span className="roadmap-render-status-text">
                        {t(statusLabelKey)}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MediaTilesBlock({
  headingId,
  items,
}: {
  headingId: string;
  items: RunMediaItem[];
}) {
  const { t } = useTranslation("openhands");

  return (
    <section className="roadmap-render-block" aria-labelledby={headingId}>
      <h3 className="roadmap-render-heading" id={headingId}>
        {t(I18nKey.ROADMAP$RENDERS_AND_BROWSER_TESTS)}
      </h3>
      <div className="roadmap-render-grid">
        {items.map((item) => (
          <a
            aria-label={`${t(renderKindLabel[item.kind])}: ${item.label}`}
            className={`roadmap-render-tile kind-${item.kind} has-media`}
            href={item.url}
            key={item.id}
            rel="noreferrer"
            target="_blank"
          >
            <span
              className="roadmap-render-visual roadmap-render-visual-media"
              aria-hidden="true"
            >
              {item.mediaType === "video" ? (
                <video
                  className="roadmap-render-media"
                  loop
                  muted
                  onError={(event) => {
                    const el = event.currentTarget;
                    el.style.display = "none";
                  }}
                  playsInline
                  preload="metadata"
                  src={item.url}
                />
              ) : (
                <img
                  alt=""
                  className="roadmap-render-media"
                  loading="lazy"
                  onError={(event) => {
                    const el = event.currentTarget;
                    el.style.display = "none";
                  }}
                  src={item.url}
                />
              )}
              {item.mediaType === "video" ? (
                <span className="roadmap-render-play" />
              ) : null}
            </span>
            <span className="roadmap-render-copy">
              <span className="roadmap-render-kind">
                {t(renderKindLabel[item.kind])}
              </span>
              <span className="roadmap-render-label">{item.label}</span>
              {item.meta ? (
                <span className="roadmap-render-meta">
                  <span>{item.meta}</span>
                </span>
              ) : null}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/**
 * Render a run's real captured media from the filer when it exists, otherwise
 * fall back to the styled placeholder tiles. Both paths render the same tile
 * box, so the card looks identical whether or not media has been captured yet
 * (captures don't persist today, so the placeholder is the common case).
 */
function RunRenderTiles({
  headingId,
  automationId,
  runId,
  placeholderTiles,
}: {
  headingId: string;
  automationId?: string;
  runId?: string;
  placeholderTiles: RenderTile[];
}) {
  const folderUrl =
    automationId && runId ? buildRunFolderUrl(automationId, runId) : null;
  const { data: media } = useRunMedia(folderUrl);

  if (media && media.length > 0) {
    return <MediaTilesBlock headingId={headingId} items={media} />;
  }

  return <RenderTilesBlock headingId={headingId} tiles={placeholderTiles} />;
}

export default function RoadmapPage() {
  const { t } = useTranslation("openhands");
  const { phases, isLoading, isError, refetch } = useRoadmapPhases();
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const rafRef = useRef<number | null>(null);
  const [roadmapProgress, setRoadmapProgress] = useState(0);
  const [pageProgress, setPageProgress] = useState(0);
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => new Set());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const dispatchMutation = useDispatchAutomation();
  const { navigate } = useNavigation();

  const togglePhase = (phaseLabel: string) => {
    setOpenPhases((current) => {
      const next = new Set(current);

      if (next.has(phaseLabel)) {
        next.delete(phaseLabel);
      } else {
        next.add(phaseLabel);
      }

      return next;
    });
  };

  const handleDetailAction = (action: string, phase: Phase) => {
    if (action === "run-now") {
      if (phase.automation) {
        dispatchMutation.mutate(phase.automation.id);
      }
      return;
    }

    if (action === "configure") {
      setIsConfigOpen(true);
      return;
    }

    if (action === "open-conversation") {
      const conversationId = phase.runs?.find(
        (run) => run.conversation_id,
      )?.conversation_id;

      if (conversationId) {
        navigate?.(`/conversations/${conversationId}`);
      }
    }
  };

  useEffect(() => {
    const observedItems = itemRefs.current.filter(
      (item): item is HTMLElement => item !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("seen");
          }
        });
      },
      { threshold: 0.35 },
    );

    observedItems.forEach((item) => observer.observe(item));

    // The app scrolls inside `#root-outlet` (root-layout), not the window — the
    // outer layout is `overflow-hidden`, so window scroll never fires and
    // `document.documentElement.scrollTop` stays 0. Bind to that container so
    // the progress bar, timeline fill, and % actually track scrolling.
    const scroller = document.getElementById("root-outlet");
    const scrollTarget: EventTarget = scroller ?? window;

    const updateScrollProgress = () => {
      rafRef.current = null;

      const metricsEl = scroller ?? document.documentElement;
      const maxScroll = Math.max(
        1,
        metricsEl.scrollHeight - metricsEl.clientHeight,
      );
      const nextPageProgress = clamp(metricsEl.scrollTop / maxScroll);
      const timeline = timelineRef.current;

      progressBarRef.current?.style.setProperty(
        "width",
        `${nextPageProgress * 100}%`,
      );
      setPageProgress(Math.round(nextPageProgress * 100));

      if (!timeline) {
        return;
      }

      // `getBoundingClientRect()` is viewport-relative; measure the timeline
      // against the scroll container's own viewport box + visible height.
      const viewportTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewportHeight = scroller
        ? scroller.clientHeight
        : window.innerHeight;
      const rect = timeline.getBoundingClientRect();
      const start = viewportHeight * 0.5;
      const nextRoadmapProgress = clamp(
        (start - (rect.top - viewportTop)) / rect.height,
      );
      const percent = Math.round(nextRoadmapProgress * 100);

      fillRef.current?.style.setProperty(
        "height",
        `${nextRoadmapProgress * 100}%`,
      );
      setRoadmapProgress(percent);
    };

    const requestUpdate = () => {
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(updateScrollProgress);
      }
    };

    scrollTarget.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    requestUpdate();

    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // `phases` is a dependency so the IntersectionObserver re-attaches once the
    // real automation data lands (the list is empty on the first async render).
  }, [openPhases, phases]);

  return (
    <main className="roadmap-page">
      <div
        aria-label={t(I18nKey.ROADMAP$PAGE_SCROLL_PROGRESS)}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={pageProgress}
        className="roadmap-top-bar"
        ref={progressBarRef}
        role="progressbar"
      />

      <div className="roadmap-wrap">
        <header className="roadmap-hero">
          <p className="roadmap-eyebrow">{t(I18nKey.ROADMAP$EYEBROW)}</p>
          <h1>
            {t(I18nKey.ROADMAP$HERO_TITLE_LEAD)}{" "}
            <span className="roadmap-highlight">
              {t(I18nKey.ROADMAP$HERO_TITLE_HIGHLIGHT)}
            </span>
            <br />
            {t(I18nKey.ROADMAP$HERO_TITLE_TAIL)}
          </h1>
          <p className="roadmap-lede">{t(I18nKey.ROADMAP$LEDE)}</p>
        </header>

        <div className="roadmap-grid">
          <aside
            className="roadmap-rail"
            aria-label={t(I18nKey.ROADMAP$PROGRESS_SUMMARY)}
          >
            <div
              aria-label={t(I18nKey.ROADMAP$COMPLETE)}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={roadmapProgress}
              className="roadmap-pct"
              role="progressbar"
            >
              {roadmapProgress}
              <span>%</span>
            </div>
            <div className="roadmap-label">{t(I18nKey.ROADMAP$COMPLETE)}</div>
            <hr />
            <div
              className="roadmap-legend"
              aria-label={t(I18nKey.ROADMAP$STATUS_LEGEND)}
            >
              <div>
                <i className="g1" aria-hidden="true" />
                {t(I18nKey.ROADMAP$STATUS_SHIPPED)}
              </div>
              <div>
                <i className="g2" aria-hidden="true" />
                {t(I18nKey.ROADMAP$STATUS_IN_PROGRESS)}
              </div>
              <div>
                <i className="g3" aria-hidden="true" />
                {t(I18nKey.ROADMAP$STATUS_PLANNED)}
              </div>
            </div>
            <button
              className="roadmap-cfg"
              type="button"
              onClick={() => setIsConfigOpen(true)}
            >
              {t(I18nKey.ROADMAP$CONFIGURE_AUTOMATIONS)}
            </button>
          </aside>

          <section
            className="roadmap-timeline"
            aria-label={t(I18nKey.ROADMAP$PHASES)}
            ref={timelineRef}
          >
            <div className="roadmap-fill" ref={fillRef} />

            {isLoading ? (
              <p className="roadmap-empty" role="status">
                {t(I18nKey.ROADMAP$LOADING)}
              </p>
            ) : isError ? (
              <div className="roadmap-empty" role="alert">
                <p>{t(I18nKey.ROADMAP$ERROR)}</p>
                <button onClick={() => refetch()} type="button">
                  {t(I18nKey.AUTOMATIONS$ERROR_RETRY)}
                </button>
              </div>
            ) : phases.length === 0 ? (
              <p className="roadmap-empty" role="status">
                {t(I18nKey.ROADMAP$EMPTY)}
              </p>
            ) : (
              phases.map((phase, index) => {
                const isOpen = openPhases.has(phase.phaseLabel);
                const detailId = detailIdFor(phase.phaseLabel);
                const renderHeadingId = `${detailId}-renders`;
                const renderTiles = phase.renderTiles ?? [];
                const isLeftSide = index % 2 === 0;

                return (
                  <article
                    className={`roadmap-item roadmap-item-${isLeftSide ? "left" : "right"}${phase.status === "shipped" ? " done" : ""}`}
                    key={phase.phaseLabel}
                    ref={(node) => {
                      itemRefs.current[index] = node;
                    }}
                  >
                    <div className="roadmap-node" aria-hidden="true" />
                    <div className="roadmap-card">
                      <button
                        aria-controls={detailId}
                        aria-expanded={isOpen}
                        className="roadmap-card-header"
                        onClick={() => togglePhase(phase.phaseLabel)}
                        type="button"
                      >
                        <span className="roadmap-card-copy">
                          <span className="roadmap-meta">
                            <span
                              className={`roadmap-tag ${phase.status === "shipped" ? "done" : ""}${
                                phase.status === "in-progress" ? "now" : ""
                              }`}
                            >
                              {t(statusLabel[phase.status])}
                            </span>
                            <span>{phase.phaseLabel}</span>
                          </span>
                          <span className="roadmap-title">{phase.title}</span>
                          <span className="roadmap-blurb">{phase.blurb}</span>
                        </span>
                        <span className="roadmap-chevron" aria-hidden="true" />
                      </button>

                      <div
                        className={`roadmap-expander${isOpen ? " open" : ""}`}
                        id={detailId}
                      >
                        <div className="roadmap-expander-inner">
                          {phase.subs.length > 0 ? (
                            <div className="roadmap-subs">
                              {phase.subs.map((sub) => (
                                <div
                                  className={`roadmap-sub${sub.done ? " ok" : ""}`}
                                  key={sub.label}
                                >
                                  <span
                                    className="roadmap-check"
                                    aria-hidden="true"
                                  />
                                  {sub.label}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {phase.automation ? (
                            <div className="roadmap-detail">
                              <div className="roadmap-trigger">
                                <span className="roadmap-detail-label">
                                  {t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER)}
                                </span>
                                <span>
                                  {formatTrigger(phase.automation.trigger, t)}
                                </span>
                              </div>

                              <div className="roadmap-meta-grid">
                                <div>
                                  <span className="roadmap-detail-label">
                                    {t(I18nKey.ROADMAP$DETAIL_REPOSITORY)}
                                  </span>
                                  <span>
                                    {phase.automation.repository ?? "-"}
                                  </span>
                                </div>
                                <div>
                                  <span className="roadmap-detail-label">
                                    {t(I18nKey.ROADMAP$DETAIL_MODEL)}
                                  </span>
                                  <span>{phase.automation.model ?? "-"}</span>
                                </div>
                                <div>
                                  <span className="roadmap-detail-label">
                                    {t(I18nKey.ROADMAP$DETAIL_ENABLED)}
                                  </span>
                                  <span>
                                    {phase.automation.enabled
                                      ? t(I18nKey.ROADMAP$DETAIL_YES)
                                      : t(I18nKey.ROADMAP$DETAIL_NO)}
                                  </span>
                                </div>
                              </div>

                              <div className="roadmap-run-history">
                                <span className="roadmap-detail-label">
                                  {t(I18nKey.ROADMAP$RUN_HISTORY)}
                                </span>
                                {phase.runs && phase.runs.length > 0 ? (
                                  <div className="roadmap-runs">
                                    {phase.runs.map((run) => (
                                      <div className="roadmap-run" key={run.id}>
                                        <div className="roadmap-run-main">
                                          <span
                                            className={`roadmap-run-badge ${run.status.toLowerCase()}`}
                                          >
                                            {t(runStatusLabel[run.status])}
                                          </span>
                                          <span className="roadmap-run-time">
                                            {formatDateTime(run.started_at)}
                                          </span>
                                          <span className="roadmap-run-duration">
                                            {formatRunDuration(run, t)}
                                          </span>
                                        </div>
                                        {run.status ===
                                          AutomationRunStatus.FAILED &&
                                        run.error_detail ? (
                                          <p className="roadmap-run-error">
                                            {run.error_detail}
                                          </p>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="roadmap-empty">
                                    {t(I18nKey.ROADMAP$NO_RUNS)}
                                  </p>
                                )}
                              </div>

                              {renderTiles.length > 0 ? (
                                <RunRenderTiles
                                  automationId={phase.automation.id}
                                  headingId={renderHeadingId}
                                  placeholderTiles={renderTiles}
                                  runId={phase.runs?.[0]?.id}
                                />
                              ) : null}

                              <div
                                className="roadmap-actions"
                                aria-label={t(I18nKey.ROADMAP$PHASE_ACTIONS, {
                                  phaseLabel: phase.phaseLabel,
                                })}
                              >
                                <button
                                  onClick={() =>
                                    handleDetailAction("run-now", phase)
                                  }
                                  type="button"
                                >
                                  {t(I18nKey.AUTOMATIONS$RUN_NOW)}
                                </button>
                                <button
                                  onClick={() =>
                                    handleDetailAction("configure", phase)
                                  }
                                  type="button"
                                >
                                  {t(I18nKey.ROADMAP$ACTION_CONFIGURE)}
                                </button>
                                <button
                                  disabled={
                                    !phase.runs || phase.runs.length === 0
                                  }
                                  onClick={() =>
                                    handleDetailAction(
                                      "open-conversation",
                                      phase,
                                    )
                                  }
                                  type="button"
                                >
                                  {t(I18nKey.ROADMAP$ACTION_OPEN_CONVERSATION)}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {renderTiles.length > 0 ? (
                                <div className="roadmap-detail">
                                  <RunRenderTiles
                                    headingId={renderHeadingId}
                                    placeholderTiles={renderTiles}
                                  />
                                </div>
                              ) : null}
                              <p className="roadmap-empty">
                                {t(I18nKey.ROADMAP$NO_AUTOMATION_LINKED)}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </div>

        <footer className="roadmap-footer">{t(I18nKey.ROADMAP$FOOTER)}</footer>
      </div>

      <ConfigureAutomationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />
    </main>
  );
}
