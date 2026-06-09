import { useState, useEffect, useCallback } from "preact/hooks";
import { gtfsRtApi } from "../api";
import { dataCache } from "../store";
import type { ServiceAlert, AlertSeverity } from "../types";
import { WidgetBase } from "./widget-base";

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  INFO: "Info",
  WARNING: "Warning",
  SEVERE: "Severe",
};

const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  INFO: "badge--info",
  WARNING: "badge--warning",
  SEVERE: "badge--severe",
};

export function AlertWidget() {
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const cached = dataCache.getAlerts();
      if (cached) {
        setAlerts(cached);
        return;
      }
      const data = await gtfsRtApi.getAlerts();
      dataCache.setAlerts(data);
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch alerts");
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  if (error) {
    return (
      <WidgetBase size="medium">
        <div class="alert-widget">
          <h3 class="alert-widget__title">Service Alerts</h3>
          <p class="alert-widget__error">{error}</p>
        </div>
      </WidgetBase>
    );
  }

  const severe = alerts.filter((a) => a.severity === "SEVERE");
  const warnings = alerts.filter((a) => a.severity === "WARNING");
  const info = alerts.filter((a) => a.severity === "INFO");

  return (
    <WidgetBase size="medium">
      <div class="alert-widget">
        <h3 class="alert-widget__title">
          Service Alerts
          {alerts.length > 0 && (
            <span class="alert-widget__count">{alerts.length}</span>
          )}
        </h3>
        {alerts.length === 0 && (
          <p class="alert-widget__none">No active alerts</p>
        )}
        <div class="alert-widget__list">
          {severe.slice(0, 2).map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
          {warnings.slice(0, 2).map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
          {info.slice(0, 1).map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      </div>
    </WidgetBase>
  );
}

function AlertItem({ alert }: { alert: ServiceAlert }) {
  return (
    <div class="alert-widget__item">
      <span class={["badge", SEVERITY_CLASS[alert.severity]].join(" ")}>
        {SEVERITY_LABELS[alert.severity]}
      </span>
      <span class="alert-widget__item-text">{alert.header}</span>
    </div>
  );
}
