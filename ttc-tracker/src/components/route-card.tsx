import type { RouteWithDirections } from "../types";
import { WidgetBase } from "./widget-base";

interface RouteCardProps {
  route: RouteWithDirections;
  onSelectStop: (stopCode: string, stopName: string) => void;
}

export function RouteCard({ route, onSelectStop }: RouteCardProps) {
  const serviceLabel = route.serviceLevel?.name ?? (route.inService ? "In Service" : "Not in Service");
  const statusClass = route.inService ? "route-card__status--active" : "route-card__status--inactive";

  return (
    <WidgetBase size="medium" accent={route.colour}>
      <div class="route-card">
        <div class="route-card__header">
          <div class="route-card__route">
            <span class="route-card__name" style={route.colour ? { color: route.colour } : undefined}>
              {route.shortName}
            </span>
            <span class="route-card__long">{route.longName}</span>
          </div>
          <span class={["route-card__status", statusClass].join(" ")}>{serviceLabel}</span>
        </div>

        {route.message && (
          <p class="route-card__message">{route.message}</p>
        )}

        {route.frequency && (
          <p class="route-card__frequency">Frequency: {route.frequency}</p>
        )}

        {route.directions.length > 0 && (
          <div class="route-card__directions">
            {route.directions.slice(0, 2).map((dir) => (
              <div key={dir.id} class="route-card__direction">
                <span class="route-card__dir-name">{dir.name}</span>
                {dir.stops.length > 0 && (
                  <div class="route-card__stops">
                    {dir.stops.slice(0, 5).map((stop) => (
                      <button
                        key={stop.code}
                        class="route-card__stop"
                        onClick={() => onSelectStop(stop.code, stop.name)}
                      >
                        {stop.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetBase>
  );
}
