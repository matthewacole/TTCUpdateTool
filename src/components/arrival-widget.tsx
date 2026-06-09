import { useState, useEffect, useCallback } from "preact/hooks";
import { ttcApi } from "../api";
import { dataCache } from "../store";
import { preferences } from "../store";
import type { ArrivalPrediction } from "../types";
import { WidgetBase } from "./widget-base";

interface ArrivalWidgetProps {
  routeId: number;
  routeName: string;
  routeColour: string | null;
  stopCode: string;
  stopName: string;
}

export function ArrivalWidget({ routeId, routeName, routeColour, stopCode, stopName }: ArrivalWidgetProps) {
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
    const interval = setInterval(fetchPredictions, preferences.get().refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [fetchPredictions]);

  const isFav = preferences.isFavorite(routeId, stopCode);
  const toggleFav = () => {
    if (isFav) {
      preferences.removeFavorite(routeId, stopCode);
    } else {
      preferences.addFavorite({ routeId, routeName, routeColour, stopCode, stopName });
    }
  };

  return (
    <WidgetBase size="small" accent={routeColour}>
      <div class="arrival-widget">
        <div class="arrival-widget__header">
          <span class="arrival-widget__route" style={routeColour ? { color: routeColour } : undefined}>
            {routeName}
          </span>
          <button
            class="arrival-widget__fav"
            onClick={toggleFav}
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            {isFav ? "★" : "☆"}
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
          {!error && prediction?.vehicles.map((v) => (
            <span key={v.vehicleId} class="arrival-widget__time">
              {v.minutes}
              <small>min</small>
            </span>
          ))}
        </div>
        {prediction && prediction.vehicles.length > 0 && (
          <span class="arrival-widget__dest">
            to {prediction.vehicles[0].destination ?? "Unknown"}
          </span>
        )}
      </div>
    </WidgetBase>
  );
}
