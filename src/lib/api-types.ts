// Typy odpovedí API – zdieľané medzi serverom a klientom.

export interface RouteDTO {
  id: string;
  name: string;
  long: string;
  type: number;
  color: string | null;
  textColor: string | null;
}

export interface StopGroupDTO {
  /** napr. „U1472“ */
  id: string;
  name: string;
  lat: number;
  lon: number;
  zone: string;
  /** krátke názvy liniek */
  lines: string[];
  /** typy dopravy (route_type) */
  types: number[];
}

export interface DepartureDTO {
  tripId: string;
  date: number;
  route: RouteDTO;
  headsign: string;
  stopId: string;
  platform: string;
  /** plánovaný odchod, epoch sekundy */
  scheduled: number;
  /** meškanie v sekundách, null = bez online dát */
  delay: number | null;
  /** vozidlo práve stojí v tejto zastávke */
  atStop: boolean;
  vehicle: string | null;
  wheelchair: boolean;
  onRequest: boolean;
}

export interface DeparturesResponse {
  group: { id: string; name: string; lat: number; lon: number; zone: string };
  platforms: { id: string; platform: string; lat: number; lon: number }[];
  departures: DepartureDTO[];
  alerts: AlertDTO[];
  now: number;
  realtimeOk: boolean;
}

export interface VehicleDTO {
  id: string;
  label: string;
  tripId: string;
  date: number | null;
  route: RouteDTO | null;
  headsign: string;
  lat: number;
  lon: number;
  bearing: number | null;
  delay: number | null;
  stopped: boolean;
  nextStop: string | null;
  wheelchair: boolean;
  ts: number;
}

export interface VehiclesResponse {
  vehicles: VehicleDTO[];
  feedTimestamp: number;
  error: string | null;
}

export interface TripStopDTO {
  stopId: string;
  groupId: string;
  name: string;
  platform: string;
  lat: number;
  lon: number;
  arr: number;
  dep: number;
  onRequest: boolean;
  noBoarding: boolean;
  noAlighting: boolean;
}

export interface TripDetailDTO {
  tripId: string;
  date: number;
  route: RouteDTO;
  headsign: string;
  wheelchair: boolean;
  stops: TripStopDTO[];
  vehicle: VehicleDTO | null;
  /** index zastávky, ku ktorej vozidlo smeruje / v ktorej stojí */
  currentIndex: number | null;
  alerts: AlertDTO[];
}

export interface AlertDTO {
  id: string;
  header: string;
  description: string;
  url: string | null;
  effect: string;
  lines: string[];
  stops: string[];
  start: number | null;
  end: number | null;
}

export type PlaceParam = { kind: "group"; id: string } | { kind: "coord"; lat: number; lon: number; label?: string };

export interface WalkLegDTO {
  type: "walk";
  from: LegPlace;
  to: LegPlace;
  dep: number;
  arr: number;
  distance: number;
}

export interface LegPlace {
  name: string;
  groupId: string | null;
  stopId: string | null;
  platform: string | null;
  lat: number;
  lon: number;
}

export interface RideLegDTO {
  type: "ride";
  tripId: string;
  date: number;
  route: RouteDTO;
  headsign: string;
  from: LegPlace;
  to: LegPlace;
  dep: number;
  arr: number;
  /** medzizastávky vrátane nástupnej a výstupnej */
  stops: { name: string; groupId: string; time: number; lat: number; lon: number }[];
  delay: number | null;
  vehicle: string | null;
  wheelchair: boolean;
}

export type LegDTO = WalkLegDTO | RideLegDTO;

export interface JourneyDTO {
  id: string;
  dep: number;
  arr: number;
  transfers: number;
  walk: number;
  legs: LegDTO[];
}

export interface PlanResponse {
  journeys: JourneyDTO[];
  from: string;
  to: string;
  searchTime: number;
}

export interface LineDTO {
  route: RouteDTO;
  directions: {
    headsign: string;
    stops: { groupId: string; name: string; lat: number; lon: number }[];
    trips: number;
  }[];
  vehicles: VehicleDTO[];
  alerts: AlertDTO[];
}

export interface GeoResult {
  lat: number;
  lon: number;
  label: string;
  detail: string;
}
