import { Point, RouteQuote, TravelMode } from "@/lib/types";
import { RouteProvider } from "@/lib/providers/base";
import { MockRouteProvider } from "@/lib/providers/mockRouteProvider";

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

type GoogleTravelMode = "DRIVE" | "TRANSIT" | "BICYCLE" | "WALK";

const modeMap: Record<TravelMode, GoogleTravelMode> = {
  car: "DRIVE",
  transit: "TRANSIT",
  bike: "BICYCLE",
  walk: "WALK"
};

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    travelAdvisory?: {
      transitFare?: {
        units?: string;
        nanos?: number;
      };
    };
  }>;
};

function parseDurationSec(duration?: string): number {
  if (!duration) return 0;
  const raw = duration.endsWith("s") ? duration.slice(0, -1) : duration;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function parseFareKRW(value?: { units?: string; nanos?: number }): number | undefined {
  if (!value) return undefined;
  const units = Number(value.units ?? "0");
  const nanos = value.nanos ?? 0;
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return undefined;
  return Math.max(0, Math.round(units + nanos / 1_000_000_000));
}

function buildRequestBody(origin: Point, destination: Point, mode: TravelMode) {
  return {
    origin: {
      location: {
        latLng: {
          latitude: origin.lat,
          longitude: origin.lng
        }
      }
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.lat,
          longitude: destination.lng
        }
      }
    },
    travelMode: modeMap[mode],
    languageCode: "ko",
    units: "METRIC",
    departureTime: new Date().toISOString()
  };
}

export class HybridRouteProvider implements RouteProvider {
  private readonly fallback = new MockRouteProvider();
  private readonly apiKey = process.env.GOOGLE_ROUTES_API_KEY ?? "";

  async quote(origin: Point, destination: Point, mode: TravelMode): Promise<RouteQuote> {
    if (!this.apiKey) {
      return this.fallback.quote(origin, destination, mode);
    }

    try {
      const response = await fetch(GOOGLE_ROUTES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.travelAdvisory.transitFare"
        },
        body: JSON.stringify(buildRequestBody(origin, destination, mode)),
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`google routes request failed: ${response.status}`);
      }

      const data = (await response.json()) as GoogleRoutesResponse;
      const first = data.routes?.[0];
      if (!first) {
        throw new Error("google routes returned no routes");
      }

      return {
        mode,
        durationSec: parseDurationSec(first.duration),
        distanceM: Math.max(0, Math.round(first.distanceMeters ?? 0)),
        fareKRW: mode === "transit" ? parseFareKRW(first.travelAdvisory?.transitFare) : undefined,
        provider: "google"
      };
    } catch {
      return this.fallback.quote(origin, destination, mode);
    }
  }
}
