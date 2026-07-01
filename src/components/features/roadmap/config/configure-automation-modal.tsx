import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
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

  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
      setNameError(null);
      setPromptError(null);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted hover:text-foreground"
          aria-label={t(I18nKey.BUTTON$CLOSE)}
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 className={modalTitleLgMediumClassName}>
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
    </div>
  );
}
