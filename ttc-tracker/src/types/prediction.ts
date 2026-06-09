export interface ArrivalPrediction {
  routeId: number;
  routeName: string;
  routeColour: string | null;
  stopCode: string;
  stopName: string;
  vehicles: VehicleArrival[];
  lastUpdated: number;
}

export interface VehicleArrival {
  vehicleId: string;
  minutes: number;
  seconds: number;
  isDeparture: boolean;
  tripId: string | null;
  destination: string | null;
  delay: number | null;
  vehicleType: string;
}

export interface VehiclePosition {
  id: string;
  routeId: string;
  lat: number;
  lon: number;
  bearing: number;
  speed: number | null;
  tripId: string | null;
  secondsSinceReport: number;
}
