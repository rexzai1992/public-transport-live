/* Provider metadata contract — design stage only.

   Runtime code still uses the existing FEEDS registry. This contract captures
   what must be known and verified before an international feed can be enabled.
   Pure timezone and speed conversions live in normalization.ts so the profile
   objects remain data-only. */

import type { TransitMode } from "../config.js";

export type CountryCode = "MY" | "SG" | "JP" | "CN";

/** Passenger-visible modes. Existing runtime code still receives bus/rail. */
export type ProviderTransportMode =
  | TransitMode
  | "metro"
  | "subway"
  | "regional-rail"
  | "high-speed-rail"
  | "airport-rail"
  | "ferry";

/** Unit the upstream feed actually publishes VehiclePosition.speed in. */
export type SpeedUnit = "mps" | "kmh";

/** WGS84 elsewhere; mainland-China providers may use either encrypted datum. */
export type CoordinateSystem = "WGS84" | "GCJ-02" | "BD-09";

/** Passenger-facing data-truth labels shared with AGENTS.md. */
export type DataTruth =
  | "LIVE_GPS"
  | "LIVE_ETA"
  | "SCHEDULED"
  | "ESTIMATED"
  | "DELAYED"
  | "STALE"
  | "UNAVAILABLE";

export type Capability =
  | "operators"
  | "routes"
  | "stops"
  | "trips"
  | "schedules"
  | "vehicles"
  | "arrivals"
  | "tripUpdates"
  | "alerts"
  | "journeyPlanning";

/* "derived" means the app reconstructs the value from other source data and
   must label it accordingly. An absent key means explicitly unsupported. */
export type CapabilitySource = "provider" | "derived";

/** Environment-variable names only; credential values never belong here. */
export type ProviderAuth =
  | { kind: "none" }
  | {
      kind: "apiKey";
      envVars: readonly string[];
      placement: "header" | "query";
    }
  | { kind: "signed"; envVars: readonly string[] }
  | { kind: "oauth2"; envVars: readonly string[] }
  | { kind: "custom"; envVars: readonly string[] };

export type LicenceStatus =
  | "unrecorded"
  | "authorized"
  | "licence-pending"
  | "registration-required"
  | "paid-approval-required"
  | "experimental"
  | "unavailable";

export type ProviderProfile = {
  feedId: string;
  /** False for configured/researched adapters that are unsafe to expose. */
  productionEnabled: boolean;
  country: CountryCode;
  /** Cities or regions a passenger would recognise. */
  scope: readonly string[];
  mode: ProviderTransportMode;
  /** Generic GTFS parser or a provider-specific adapter. */
  ingestion: "gtfs" | "adapter";
  /** IANA zone of the feed's timetable wall clock. */
  timeZone: string;
  /** Null when no upstream speed value is published. */
  speedUnit: SpeedUnit | null;
  coordinateSystem: CoordinateSystem;
  auth: ProviderAuth;
  capabilities: Partial<Record<Capability, CapabilitySource>>;
  freshness: {
    /** In-process cache TTL for realtime data, if any. */
    realtimeTtlMs: number | null;
    /** Age after which live data must be labelled STALE. */
    staleAfterMs: number | null;
  };
  licence: {
    status: LicenceStatus;
    attribution: string | null;
  };
};
