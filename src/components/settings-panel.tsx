import { useState } from "preact/hooks";
import { preferences } from "../store";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const current = preferences.get().alertFilter ?? "all";
  const [selected, setSelected] = useState<"all" | "priority">(current);

  const handleSelect = (value: "all" | "priority") => {
    setSelected(value);
    preferences.update({ alertFilter: value });
  };

  return (
    <div class="overlay" onClick={onClose}>
      <div class="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div class="settings-panel__header">
          <span class="settings-panel__title">Settings</span>
          <button class="settings-panel__close" onClick={onClose}>✕</button>
        </div>

        <div class="settings-panel__body">
          <div class="settings-panel__section">
            <span class="settings-panel__section-title">Service Alerts</span>

            <label
              class={`settings-panel__option${selected === "all" ? " settings-panel__option--active" : ""}`}
              onClick={() => handleSelect("all")}
            >
              <span class="settings-panel__option-check">
                {selected === "all" && <span class="settings-panel__checkmark">✓</span>}
              </span>
              <span class="settings-panel__option-content">
                <span class="settings-panel__option-label">All service alerts</span>
                <span class="settings-panel__option-desc">Show every active service alert from the TTC</span>
              </span>
            </label>

            <label
              class={`settings-panel__option${selected === "priority" ? " settings-panel__option--active" : ""}`}
              onClick={() => handleSelect("priority")}
            >
              <span class="settings-panel__option-check">
                {selected === "priority" && <span class="settings-panel__checkmark">✓</span>}
              </span>
              <span class="settings-panel__option-content">
                <span class="settings-panel__option-label">Priority alerts</span>
                <span class="settings-panel__option-desc">Only severe and warning alerts, plus info alerts about the subway and routes you follow</span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
