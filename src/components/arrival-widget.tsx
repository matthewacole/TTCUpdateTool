import { useState, useEffect, useCallback } from "preact/hooks";
import { ttcApi } from "../api";
import { dataCache } from "../store";
import type { ArrivalPrediction, VehicleArrival } from "../types";
import { WidgetBase } from "./widget-base";

interface ArrivalWidgetProps {
  routeId: number;
  routeName: string;
  routeColour: string | null;
  stopCode: string;
  stopName: string;
  onDelete: (routeId: number, stopCode: string) => void;
}

function dirBadge(dest: string | null): string {
  const d = (dest ?? "").toLowerCase();
  if (d.includes("north")) return "NB";
  if (d.includes("south")) return "SB";
  if (d.includes("east")) return "EB";
  if (d.includes("west")) return "WB";
  return "";
}

function destShort(dest: string | null): string {
  const d = (dest ?? "").replace(/^(to|via)\s+/i, "").trim();
  return d.length > 40 ? d.substring(0, 38) + "…" : d;
}

export function ArrivalWidget({ routeId, routeName, routeColour, stopCode, stopName, onDelete }: ArrivalWidgetProps) {
  const [prediction, setPrediction] = useState<ArrivalPrediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    try {
      const cached = dataCache.getPredictions(routeId, stopCode);
      if (cached) {
        setPrediction(cached);
        return;
      }
      const data = await ttcApi.getNextBuses(routeId, stopCode);
      dataCache.setPredictions(data);
      setPrediction(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    }
  }, [routeId, stopCode]);

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 30000);
    return () => clearInterval(interval);
  }, [fetchPredictions]);

  const grouped = (prediction?.vehicles ?? []).reduce<Record<string, VehicleArrival[]>>((acc, v) => {
    const key = v.destination ?? "Unknown";
    (acc[key] ??= []).push(v);
    return acc;
  }, {});

  return (
    <WidgetBase size="small" accent={routeColour}>
      <div class="arrival-widget">
        <div class="arrival-widget__header">
          <span class="arrival-widget__route" style={routeColour ? { color: routeColour } : undefined}>
            {routeName}
          </span>
          <button
            class="arrival-widget__delete"
            onClick={() => onDelete(routeId, stopCode)}
            aria-label="Remove stop"
          >
            ✕
          </button>
        </div>
        <span class="arrival-widget__stop">{stopName}</span>
        <div class="arrival-widget__times">
          {error && <span class="arrival-widget__error">{error}</span>}
          {!error && !prediction && (
            <span class="arrival-widget__loading">—</span>
          )}
          {!error && prediction && prediction.vehicles.length === 0 && (
            <span class="arrival-widget__empty">No vehicles</span>
          )}
          {!error && Object.entries(grouped).map(([dest, vehicles]) => (
            <div key={dest} class="arrival-widget__group">
              <span class="arrival-widget__group-dest">
                {dirBadge(dest) && <span class="arrival-widget__badge">{dirBadge(dest)}</span>}
                {destShort(dest)}
              </span>
              <div class="arrival-widget__group-times">
                {vehicles.map((v, i) => (
                  <span key={`${v.vehicleType}-${v.minutes}-${i}`} class="arrival-widget__time">
                    {v.minutes}
                    <small>min</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetBase>
  );
}
