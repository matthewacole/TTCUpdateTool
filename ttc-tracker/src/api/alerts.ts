import type { ServiceAlert } from "../types";

export function filterAlertsByPriority(
  alerts: ServiceAlert[],
  priorityRouteIds: Set<number>,
): ServiceAlert[] {
  return alerts.filter(
    (a) =>
      a.routes.length === 0 ||
      a.routes.some((r) => priorityRouteIds.has(parseInt(r, 10))),
  );
}
