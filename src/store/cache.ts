import type { ArrivalPrediction, ServiceAlert, VehiclePosition } from "../types";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class DataCache {
  private predictions = new Map<string, CacheEntry<ArrivalPrediction>>();
  private alerts: CacheEntry<ServiceAlert[]> | null = null;
  private vehicles = new Map<string, CacheEntry<VehiclePosition[]>>();
  private defaultTtl: number;

  constructor(defaultTtlMs = 30000) {
    this.defaultTtl = defaultTtlMs;
  }

  getPredictions(routeId: number, stopCode: string): ArrivalPrediction | null {
    const key = `${routeId}:${stopCode}`;
    const entry = this.predictions.get(key);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }
    this.predictions.delete(key);
    return null;
  }

  setPredictions(prediction: ArrivalPrediction): void {
    const key = `${prediction.routeId}:${prediction.stopCode}`;
    this.predictions.set(key, {
      data: prediction,
      timestamp: Date.now(),
      ttl: this.defaultTtl,
    });
  }

  getAlerts(): ServiceAlert[] | null {
    if (this.alerts && Date.now() - this.alerts.timestamp < this.alerts.ttl) {
      return this.alerts.data;
    }
    return null;
  }

  setAlerts(alerts: ServiceAlert[]): void {
    this.alerts = {
      data: alerts,
      timestamp: Date.now(),
      ttl: this.defaultTtl * 2,
    };
  }

  getVehicles(routeId: string): VehiclePosition[] | null {
    const entry = this.vehicles.get(routeId);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }
    this.vehicles.delete(routeId);
    return null;
  }

  setVehicles(routeId: string, vehicles: VehiclePosition[]): void {
    this.vehicles.set(routeId, {
      data: vehicles,
      timestamp: Date.now(),
      ttl: this.defaultTtl,
    });
  }

  clear(): void {
    this.predictions.clear();
    this.alerts = null;
    this.vehicles.clear();
  }
}

export const dataCache = new DataCache();
