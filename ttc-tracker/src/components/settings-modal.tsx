import { useState } from "preact/hooks";
import { preferences } from "../store";
import { ALL_ROUTES } from "../data/routes-list";

interface SettingsModalProps {
  onClose: () => void;
}

const SUBWAY_IDS = [1, 2, 3, 4, 5];

function routeNameById(id: number): string {
  const found = ALL_ROUTES.find((r) => parseInt(r.shortName, 10) === id);
  return found?.longName ?? `Route ${id}`;
}

function getContextRoutes(): { id: number; shortName: string }[] {
  const prefs = preferences.get();
  const seen = new Map<number, string>();
  for (const f of prefs.favoriteStops) {
    if (!seen.has(f.routeId)) {
      seen.set(f.routeId, f.routeName);
    }
  }
  for (const t of prefs.trackedStops) {
    for (const r of t.routes) {
      if (!seen.has(r.id)) {
        seen.set(r.id, r.shortName);
      }
    }
  }
  return Array.from(seen.entries()).map(([id, shortName]) => ({ id, shortName }));
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const initial = preferences.get();
  const [mode, setMode] = useState<"all" | "priority">(initial.alertFilterMode);
  const [priorityRoutes, setPriorityRoutes] = useState<number[]>([...initial.priorityRoutes]);
  const contextRoutes = getContextRoutes();

  const handleModeChange = (newMode: "all" | "priority") => {
    setMode(newMode);
    preferences.setAlertFilterMode(newMode);
  };

  const handleToggle = (id: number) => {
    const now = preferences.togglePriorityRoute(id);
    if (now) {
      setPriorityRoutes((prev) => [...prev, id]);
    } else {
      setPriorityRoutes((prev) => prev.filter((r) => r !== id));
    }
  };

  const hasContextRoutes = contextRoutes.length > 0;
  const nonSubwayContext = contextRoutes.filter((r) => !SUBWAY_IDS.includes(r.id));

  return (
    <div class="overlay" onClick={onClose}>
      <div class="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div class="settings-modal__header">
          <span class="settings-modal__title">Settings</span>
          <button class="settings-modal__close" onClick={onClose}>✕</button>
        </div>

        <div class="settings-modal__section">
          <span class="settings-modal__section-title">Alert Mode</span>
          <div class="settings-modal__mode">
            <button
              class={`settings-modal__mode-btn${mode === "all" ? " settings-modal__mode-btn--active" : ""}`}
              onClick={() => handleModeChange("all")}
            >
              All Alerts
            </button>
            <button
              class={`settings-modal__mode-btn${mode === "priority" ? " settings-modal__mode-btn--active" : ""}`}
              onClick={() => handleModeChange("priority")}
            >
              Priority Only
            </button>
          </div>
          {mode === "priority" && priorityRoutes.length === 0 && nonSubwayContext.length === 0 && (
            <span class="settings-modal__hint">Select routes below to see priority alerts</span>
          )}
        </div>

        <div class="settings-modal__section">
          <span class="settings-modal__section-title">Subway (always included)</span>
          {SUBWAY_IDS.map((id) => (
            <div key={id} class="settings-modal__route-row">
              <span class="settings-modal__route-badge">{id}</span>
              <span class="settings-modal__route-name">{routeNameById(id)}</span>
              <span class="settings-modal__lock">★</span>
            </div>
          ))}
        </div>

        <div class="settings-modal__section">
          <span class="settings-modal__section-title">My Routes</span>
          {!hasContextRoutes ? (
            <span class="settings-modal__hint">No routes yet — add a stop first</span>
          ) : nonSubwayContext.length === 0 ? (
            <span class="settings-modal__hint">All your routes are subway routes (always included)</span>
          ) : (
            nonSubwayContext.map((r) => {
              const on = priorityRoutes.includes(r.id);
              return (
                <div key={r.id} class="settings-modal__route-row">
                  <span class="settings-modal__route-badge">{r.shortName}</span>
                  <span class="settings-modal__route-name">{routeNameById(r.id)}</span>
                  <button
                    class={`settings-modal__toggle${on ? " settings-modal__toggle--on" : " settings-modal__toggle--off"}`}
                    onClick={() => handleToggle(r.id)}
                    aria-label={on ? `Remove route ${r.shortName} from priority` : `Add route ${r.shortName} to priority`}
                  >
                    <span class="settings-modal__toggle-dot" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
