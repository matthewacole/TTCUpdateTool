import { apiClient, ApiClient } from "./client";
import type { VehiclePosition, ServiceAlert, AlertSeverity, AlertEffect } from "../types";

const GTFS_CACHE_BASE = "./cache";

export interface GtfsRtCacheIndex {
  vehicles: string;
  trips: string;
  alerts: string;
  timestamp: number;
}

export class GtfsRtApi {
  private client: ApiClient;
  private baseUrl: string;

  constructor(client: ApiClient = apiClient, baseUrl: string = GTFS_CACHE_BASE) {
    this.client = client;
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async getCacheIndex(): Promise<{ timestamp: number; updatedAt: string } | null> {
    try {
      return await this.client.get<{ timestamp: number; updatedAt: string }>(
        `${this.baseUrl}/index.json`,
      );
    } catch {
      return null;
    }
  }

  async getAlerts(): Promise<ServiceAlert[]> {
    try {
      const data = await this.client.get<{ entity: GtfsRtAlertEntity[] }>(
        `${this.baseUrl}/alerts.json`,
      );
      return (data.entity ?? []).map(mapAlert);
    } catch {
      return [];
    }
  }

  async getVehicles(routeId?: string): Promise<VehiclePosition[]> {
    try {
      const data = await this.client.get<{ entity: GtfsRtVehicleEntity[] }>(
        `${this.baseUrl}/vehicles.json`,
      );
      const vehicles = (data.entity ?? []).map(mapVehicle);
      if (routeId) {
        return vehicles.filter((v) => v.routeId === routeId);
      }
      return vehicles;
    } catch {
      return [];
    }
  }
}

interface GtfsRtAlertEntity {
  id: string;
  alert?: {
    header_text?: { translation?: { text: string }[] };
    description_text?: { translation?: { text: string }[] };
    severity_level?: number;
    effect?: string;
    informed_entity?: { route_id?: string; stop_id?: string }[];
    active_period?: { start?: number; end?: number }[];
    url?: { translation?: { text: string }[] };
  };
}

interface GtfsRtVehicleEntity {
  id: string;
  vehicle?: {
    trip?: { route_id?: string; trip_id?: string };
    position?: { latitude?: number; longitude?: number; bearing?: number; speed?: number };
    timestamp?: number;
  };
}

function mapAlert(entity: GtfsRtAlertEntity): ServiceAlert {
  const a = entity.alert ?? {};
  const now = Date.now() / 1000;
  const activePeriod = (a.active_period ?? []).find(
    (p) => (p.start ?? 0) <= now && (!p.end || p.end >= now),
  );
  return {
    id: entity.id,
    header: a.header_text?.translation?.[0]?.text ?? "Unknown Alert",
    description: a.description_text?.translation?.[0]?.text ?? "",
    severity: mapSeverity(a.severity_level),
    createdAt: (activePeriod?.start ?? 0) * 1000,
    updatedAt: (activePeriod?.end ?? 0) * 1000,
    effect: mapEffect(a.effect),
    routes: [...new Set((a.informed_entity ?? []).map((e) => e.route_id).filter(Boolean) as string[])],
    stops: [...new Set((a.informed_entity ?? []).map((e) => e.stop_id).filter(Boolean) as string[])],
    url: a.url?.translation?.[0]?.text ?? null,
  };
}

function mapVehicle(entity: GtfsRtVehicleEntity): VehiclePosition {
  const v = entity.vehicle ?? {};
  const pos = v.position ?? {};
  return {
    id: entity.id,
    routeId: v.trip?.route_id ?? "",
    lat: pos.latitude ?? 0,
    lon: pos.longitude ?? 0,
    bearing: pos.bearing ?? 0,
    speed: pos.speed ?? null,
    tripId: v.trip?.trip_id ?? null,
    secondsSinceReport: v.timestamp ? Math.floor(Date.now() / 1000 - v.timestamp) : 0,
  };
}

function mapSeverity(level?: number): AlertSeverity {
  if (level === 1) return "SEVERE" as AlertSeverity;
  if (level === 2) return "WARNING" as AlertSeverity;
  return "INFO" as AlertSeverity;
}

function mapEffect(effect?: string): AlertEffect {
  switch (effect) {
    case "NO_SERVICE": return "NO_SERVICE" as AlertEffect;
    case "REDUCED_SERVICE": return "REDUCED_SERVICE" as AlertEffect;
    case "SIGNIFICANT_DELAYS": return "SIGNIFICANT_DELAYS" as AlertEffect;
    case "DETOUR": return "DETOUR" as AlertEffect;
    case "EXTRA_SERVICE": return "EXTRA_SERVICE" as AlertEffect;
    case "MODIFIED_SERVICE": return "MODIFIED_SERVICE" as AlertEffect;
    case "STOP_MOVED": return "STOP_MOVED" as AlertEffect;
    default: return "OTHER_EFFECT" as AlertEffect;
  }
}

export const gtfsRtApi = new GtfsRtApi();
