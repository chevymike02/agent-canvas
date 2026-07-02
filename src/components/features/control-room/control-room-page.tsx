import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { useNavigation } from "#/context/navigation-context";
import { isNoBackend } from "#/api/backend-registry/active-store";
import "./control-room.css";

type BackendStatus = "online" | "offline" | "checking";

/**
 * Control Room — a card per registered machine/backend, showing live health at
 * a glance. Additive, read-only view over the existing backend registry
 * (`useActiveBackendContext`) + health probes (`useBackendsHealth`); the "Open"
 * action switches the active backend and drops into its conversations. This is
 * the first surface of the multi-agent control room — it reuses what is already
 * wired rather than introducing new backend state.
 */
export default function ControlRoomPage() {
  const { t } = useTranslation("openhands");
  const { backends, active, setActive } = useActiveBackendContext();
  const { navigate } = useNavigation();

  const realBackends = backends.filter((backend) => !isNoBackend(backend));
  const health = useBackendsHealth(realBackends);

  const connectedCount = realBackends.filter(
    (backend) => health[backend.id]?.isConnected === true,
  ).length;

  const openBackend = (id: string) => {
    setActive(id);
    navigate("/conversations");
  };

  return (
    <main className="control-room">
      <header className="control-room-header">
        <p className="control-room-eyebrow">
          {t(I18nKey.CONTROL_ROOM$EYEBROW)}
        </p>
        <h1 className="control-room-title">{t(I18nKey.CONTROL_ROOM$TITLE)}</h1>
        <p className="control-room-summary">
          {t(I18nKey.CONTROL_ROOM$SUMMARY, {
            connected: connectedCount,
            total: realBackends.length,
          })}
        </p>
      </header>

      {realBackends.length === 0 ? (
        <p className="control-room-empty">{t(I18nKey.CONTROL_ROOM$EMPTY)}</p>
      ) : (
        <ul className="control-room-grid">
          {realBackends.map((backend) => {
            const backendHealth = health[backend.id];
            const status: BackendStatus =
              backendHealth?.isConnected === true
                ? "online"
                : backendHealth?.isConnected === false
                  ? "offline"
                  : "checking";
            const isActive = active.backend.id === backend.id;

            return (
              <li
                key={backend.id}
                className={`control-room-card control-room-card--${status}`}
              >
                <div className="control-room-card-top">
                  <span className="control-room-dot" aria-hidden="true" />
                  <span className="control-room-name">{backend.name}</span>
                  <span className="control-room-kind">
                    {backend.kind === "cloud"
                      ? t(I18nKey.CONTROL_ROOM$KIND_CLOUD)
                      : t(I18nKey.CONTROL_ROOM$KIND_LOCAL)}
                  </span>
                </div>

                <p className="control-room-host">{backend.host}</p>

                <p className="control-room-status">
                  {status === "online"
                    ? t(I18nKey.CONTROL_ROOM$STATUS_ONLINE)
                    : status === "offline"
                      ? t(I18nKey.CONTROL_ROOM$STATUS_OFFLINE)
                      : t(I18nKey.CONTROL_ROOM$STATUS_CHECKING)}
                  {status === "offline" && backendHealth?.lastError ? (
                    <span className="control-room-error">
                      {" "}
                      — {backendHealth.lastError}
                    </span>
                  ) : null}
                </p>

                <div className="control-room-card-actions">
                  {isActive ? (
                    <span className="control-room-active-badge">
                      {t(I18nKey.CONTROL_ROOM$ACTIVE)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="control-room-open"
                    onClick={() => openBackend(backend.id)}
                  >
                    {t(I18nKey.CONTROL_ROOM$OPEN)}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
