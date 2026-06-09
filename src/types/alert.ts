export interface ServiceAlert {
  id: string;
  header: string;
  description: string;
  severity: AlertSeverity;
  cause: string;
  createdAt: number;
  updatedAt: number;
  effect: AlertEffect;
  routes: string[];
  stops: string[];
  url: string | null;
}

export enum AlertSeverity {
  Info = "INFO",
  Warning = "WARNING",
  Severe = "SEVERE",
}

export enum AlertEffect {
  NoService = "NO_SERVICE",
  ReducedService = "REDUCED_SERVICE",
  SignificantDelays = "SIGNIFICANT_DELAYS",
  Detour = "DETOUR",
  ExtraService = "EXTRA_SERVICE",
  ModifiedService = "MODIFIED_SERVICE",
  OtherEffect = "OTHER_EFFECT",
  Unknown = "UNKNOWN",
  StopMoved = "STOP_MOVED",
}

export interface ServiceAlertSummary {
  total: number;
  severe: number;
  warnings: number;
  info: number;
  alerts: ServiceAlert[];
}
