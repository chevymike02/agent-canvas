import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { useCreateAutomationFromPreset } from "#/hooks/query/use-automations";
import type {
  CreateAutomationTrigger,
  CreatePromptAutomationRepo,
} from "#/api/automation-service/automation-service.api";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";
import {
  formControlMultilineFieldClassName,
  formControlSettingsFieldClassName,
} from "#/utils/form-control-classes";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";
import XMarkIcon from "#/icons/x-mark.svg?react";

interface ConfigureAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TriggerKind = "github" | "cron" | "manual";

const DEFAULT_REPO = "chevymike02/Common-Sense-Agentics";
const DEFAULT_EVENT_ON = "issues.opened";
const DEFAULT_EVENT_FILTER = "glob(repository.full_name, 'chevymike02/*')";
const DEFAULT_CRON_SCHEDULE = "0 9 * * 5";
const DEFAULT_CRON_TIMEZONE = "UTC";

interface FormState {
  name: string;
  prompt: string;
  repos: string;
  triggerKind: TriggerKind;
  eventOn: string;
  eventFilter: string;
  cronSchedule: string;
  cronTimezone: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  prompt: "",
  repos: DEFAULT_REPO,
  triggerKind: "github",
  eventOn: DEFAULT_EVENT_ON,
  eventFilter: DEFAULT_EVENT_FILTER,
  cronSchedule: DEFAULT_CRON_SCHEDULE,
  cronTimezone: DEFAULT_CRON_TIMEZONE,
};

// Parse the comma/newline-separated repo field into RepoSource entries.
// Short `owner/repo` forms get an explicit github provider (required by the
// backend); full URLs are passed through for provider auto-detection.
function parseRepos(raw: string): CreatePromptAutomationRepo[] {
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((url) =>
      /^https?:\/\//i.test(url)
        ? { url }
        : { url, provider: "github" as const },
    );
}

function buildTrigger(form: FormState): CreateAutomationTrigger {
  if (form.triggerKind === "cron") {
    return {
      type: "cron",
      schedule: form.cronSchedule.trim(),
      timezone: form.cronTimezone.trim() || DEFAULT_CRON_TIMEZONE,
    };
  }
  if (form.triggerKind === "manual") {
    return { type: "manual" };
  }
  const filter = form.eventFilter.trim();
  return {
    type: "event",
    source: "github",
    on: form.eventOn.trim() || DEFAULT_EVENT_ON,
    ...(filter ? { filter } : {}),
  };
}

// Elements a focus trap should treat as reachable; mirrors the common
// tabbable-selector pattern (anchors/buttons/form controls/explicit tabindex).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TRIGGER_ITEMS: { key: TriggerKind; labelKey: I18nKey }[] = [
  { key: "github", labelKey: I18nKey.AUTOMATIONS$CONFIGURE_TRIGGER_GITHUB },
  { key: "cron", labelKey: I18nKey.AUTOMATIONS$CONFIGURE_TRIGGER_CRON },
  { key: "manual", labelKey: I18nKey.AUTOMATIONS$CONFIGURE_TRIGGER_MANUAL },
];

export function ConfigureAutomationModal({
  isOpen,
  onClose,
}: ConfigureAutomationModalProps) {
  const { t } = useTranslation("openhands");
  const createMutation = useCreateAutomationFromPreset();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
      setNameError(null);
      setPromptError(null);
    }
  }, [isOpen]);

  // Move focus into the modal on open (first focusable field, falling back
  // to the panel itself), and restore focus to whatever triggered the modal
  // (the roadmap "Configure" button) once it closes.
  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const panel = panelRef.current;
    const firstFocusable =
      panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  // Trap Tab/Shift+Tab within the panel so keyboard focus can't wander into
  // the roadmap page behind the modal while it's open.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmedName = form.name.trim();
    const trimmedPrompt = form.prompt.trim();
    let hasError = false;
    if (!trimmedName) {
      setNameError(t(I18nKey.AUTOMATIONS$NAME_REQUIRED));
      hasError = true;
    } else {
      setNameError(null);
    }
    if (!trimmedPrompt) {
      setPromptError(t(I18nKey.AUTOMATIONS$PROMPT_REQUIRED));
      hasError = true;
    } else {
      setPromptError(null);
    }
    if (hasError) return;

    const repos = parseRepos(form.repos);

    createMutation.mutate(
      {
        name: trimmedName,
        prompt: trimmedPrompt,
        trigger: buildTrigger(form),
        ...(repos.length > 0 ? { repos } : {}),
      },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.AUTOMATIONS$CONFIGURE_SUCCESS));
          onClose();
        },
        onError: (error) => {
          const fallback = t(I18nKey.AUTOMATIONS$CONFIGURE_ERROR);
          const message = isAxiosError(error)
            ? (error.response?.data as { message?: string } | undefined)
                ?.message ||
              error.message ||
              fallback
            : (error as Error).message || fallback;
          displayErrorToast(message);
        },
      },
    );
  };

  return (
    // Reuses the app's shared dialog primitive (used by ~20 other modals)
    // instead of a hand-rolled overlay: it already portals to <body>, sets
    // role="dialog"/aria-modal="true", and closes on a *working* Escape
    // listener (attached at the window, unlike the dead onKeyDown this
    // replaced) and on backdrop click.
    <ModalBackdrop onClose={onClose} ariaLabelledBy={titleId}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6 outline-none transition-[opacity,transform] duration-150 ease-out starting:opacity-0 starting:scale-95 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[rgba(124,178,255,0.6)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--oh-surface)]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted hover:text-foreground"
          aria-label={t(I18nKey.BUTTON$CLOSE)}
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 id={titleId} className={modalTitleLgMediumClassName}>
          {t(I18nKey.AUTOMATIONS$CONFIGURE_TITLE)}
        </h2>

        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-4"
          aria-label={t(I18nKey.AUTOMATIONS$CONFIGURE_TITLE)}
        >
          <SettingsInput
            testId="configure-automation-name"
            name="name"
            type="text"
            label={t(I18nKey.AUTOMATIONS$NAME)}
            value={form.name}
            onChange={(value) => setForm((f) => ({ ...f, name: value }))}
            error={nameError ?? undefined}
            showRequiredTag
          />

          <label className="flex w-full min-w-0 flex-col gap-2.5">
            <span className="text-sm">
              {t(I18nKey.AUTOMATIONS$PROMPT)}{" "}
              <span className="text-red-400">*</span>
            </span>
            <textarea
              data-testid="configure-automation-prompt"
              name="prompt"
              value={form.prompt}
              onChange={(e) =>
                setForm((f) => ({ ...f, prompt: e.target.value }))
              }
              rows={4}
              placeholder={t(I18nKey.AUTOMATIONS$PROMPT_PLACEHOLDER)}
              className={cn(
                formControlMultilineFieldClassName,
                "placeholder:italic",
              )}
            />
            {promptError && (
              <span className="text-xs text-red-400">{promptError}</span>
            )}
          </label>

          <label className="flex w-full min-w-0 flex-col gap-2.5">
            <span className="text-sm">
              {t(I18nKey.AUTOMATIONS$DETAIL$REPOSITORIES)}
            </span>
            <input
              data-testid="configure-automation-repos"
              name="repos"
              type="text"
              value={form.repos}
              onChange={(e) =>
                setForm((f) => ({ ...f, repos: e.target.value }))
              }
              placeholder={t(I18nKey.AUTOMATIONS$REPOS_PLACEHOLDER)}
              className={formControlSettingsFieldClassName}
            />
            <span className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$REPOS_HINT)}
            </span>
          </label>

          <label className="flex w-full min-w-0 flex-col gap-2.5">
            <span className="text-sm">
              {t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER)}
            </span>
            <select
              data-testid="configure-automation-trigger"
              name="triggerKind"
              value={form.triggerKind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  triggerKind: e.target.value as TriggerKind,
                }))
              }
              className={formControlSettingsFieldClassName}
            >
              {TRIGGER_ITEMS.map((item) => (
                <option key={item.key} value={item.key}>
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
          </label>

          {form.triggerKind === "github" && (
            <div className="flex flex-col gap-3 rounded-lg bg-[var(--oh-surface-raised)] p-3">
              <label className="flex w-full min-w-0 flex-col gap-2">
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$CONFIGURE_EVENT_ON)}
                </span>
                <input
                  data-testid="configure-automation-event-on"
                  name="eventOn"
                  type="text"
                  value={form.eventOn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, eventOn: e.target.value }))
                  }
                  className={cn(formControlSettingsFieldClassName, "font-mono")}
                />
              </label>
              <label className="flex w-full min-w-0 flex-col gap-2">
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$CONFIGURE_EVENT_FILTER)}
                </span>
                <input
                  data-testid="configure-automation-event-filter"
                  name="eventFilter"
                  type="text"
                  value={form.eventFilter}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, eventFilter: e.target.value }))
                  }
                  className={cn(formControlSettingsFieldClassName, "font-mono")}
                />
              </label>
              <p
                className="text-xs text-amber-400"
                data-testid="configure-automation-ingress-note"
              >
                {t(I18nKey.AUTOMATIONS$CONFIGURE_INGRESS_NOTE)}
              </p>
            </div>
          )}

          {form.triggerKind === "cron" && (
            <div className="flex flex-col gap-3 rounded-lg bg-[var(--oh-surface-raised)] p-3">
              <label className="flex w-full min-w-0 flex-col gap-2">
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$CONFIGURE_CRON_SCHEDULE)}
                </span>
                <input
                  data-testid="configure-automation-cron-schedule"
                  name="cronSchedule"
                  type="text"
                  value={form.cronSchedule}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cronSchedule: e.target.value }))
                  }
                  className={cn(formControlSettingsFieldClassName, "font-mono")}
                />
              </label>
              <label className="flex w-full min-w-0 flex-col gap-2">
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$TIMEZONE)}
                </span>
                <input
                  data-testid="configure-automation-cron-timezone"
                  name="cronTimezone"
                  type="text"
                  value={form.cronTimezone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cronTimezone: e.target.value }))
                  }
                  className={formControlSettingsFieldClassName}
                />
              </label>
            </div>
          )}

          {form.triggerKind === "manual" && (
            <p className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$CONFIGURE_MANUAL_NOTE)}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <BrandButton
              testId="configure-automation-cancel"
              type="button"
              variant="secondary"
              onClick={onClose}
              isDisabled={createMutation.isPending}
            >
              {t(I18nKey.AUTOMATIONS$CANCEL)}
            </BrandButton>
            <BrandButton
              testId="configure-automation-submit"
              type="submit"
              variant="primary"
              isDisabled={createMutation.isPending}
              aria-busy={createMutation.isPending}
            >
              {createMutation.isPending
                ? t(I18nKey.AUTOMATIONS$CONFIGURE_CREATING)
                : t(I18nKey.AUTOMATIONS$CONFIGURE_SUBMIT)}
            </BrandButton>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
