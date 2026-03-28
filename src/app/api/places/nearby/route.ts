import { NextRequest, NextResponse } from "next/server";

type PlaceCandidate = {
  id: string;
  name: string;
  point: { lat: number; lng: number };
  category?: string;
};

type GoogleApiLocation = {
  lat?: number;
  lng?: number;
};

type GoogleNearbyResult = {
  place_id?: string;
  name?: string;
  vicinity?: string;
  geometry?: {
    location?: GoogleApiLocation;
  };
  types?: string[];
};

type GoogleNearbyResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleNearbyResult[];
};

function toCandidate(raw: GoogleNearbyResult): PlaceCandidate | null {
  const lat = raw.geometry?.location?.lat;
  const lng = raw.geometry?.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: raw.place_id ?? `${lat}-${lng}`,
    name: raw.name ?? raw.vicinity ?? "알 수 없는 장소",
    point: { lat: lat!, lng: lng! },
    category: raw.types?.[0],
  };
}

/**
 * Generates grid-based fallback candidates around a center point.
 * Used when Google Places API is unavailable.
 */
function generateGridCandidates(
  lat: number,
  lng: number,
  radiusM: number
): PlaceCandidate[] {
  const candidates: PlaceCandidate[] = [];
  // ~111km per degree latitude
  const latOffset = radiusM / 111_000;
  const lngOffset = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180));

  const steps = [-1, 0, 1];
  let idx = 0;
  for (const dy of steps) {
    for (const dx of steps) {
      if (dy === 0 && dx === 0) continue;
      const cLat = lat + dy * latOffset * 0.5;
      const cLng = lng + dx * lngOffset * 0.5;
      candidates.push({
        id: `grid-${idx++}`,
        name: `후보 ${idx}`,
        point: { lat: Number(cLat.toFixed(6)), lng: Number(cLng.toFixed(6)) },
      });
    }
  }

  // Also include center itself
  candidates.push({
    id: "grid-center",
    name: "중간 지점",
    point: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
  });

  return candidates;
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const radius = Number(req.nextUrl.searchParams.get("radius")) || 3000;
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { message: "lat/lng가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  if (!apiKey) {
    // No API key: return grid-based fallback candidates
    return NextResponse.json({
      places: generateGridCandidates(lat, lng, radius),
      fallback: true,
    });
  }

  try {
    // Search for subway stations (primary meeting points in Seoul)
    const stationUrl =
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
      `?location=${lat},${lng}` +
      `&radius=${radius}` +
      "&type=subway_station" +
      "&language=ko" +
      `&key=${encodeURIComponent(apiKey)}`;

    // Search for popular places (cafes, restaurants)
    const placeUrl =
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
      `?location=${lat},${lng}` +
      `&radius=${Math.round(radius * 0.7)}` +
      "&type=cafe" +
      "&language=ko" +
      `&key=${encodeURIComponent(apiKey)}`;

    const [stationRes, placeRes] = await Promise.all([
      fetch(stationUrl, { cache: "no-store" }),
      fetch(placeUrl, { cache: "no-store" }),
    ]);

    const stationJson = (await stationRes.json()) as GoogleNearbyResponse;
    const placeJson = (await placeRes.json()) as GoogleNearbyResponse;

    const stations = (stationJson.results ?? [])
      .map(toCandidate)
      .filter((c): c is PlaceCandidate => c !== null)
      .slice(0, 5);

    const cafes = (placeJson.results ?? [])
      .map(toCandidate)
      .filter((c): c is PlaceCandidate => c !== null)
      .slice(0, 3);

    // Deduplicate by id
    const seen = new Set<string>();
    const merged: PlaceCandidate[] = [];
    for (const c of [...stations, ...cafes]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push(c);
      }
    }

    if (merged.length === 0) {
      return NextResponse.json({
        places: generateGridCandidates(lat, lng, radius),
        fallback: true,
      });
    }

    return NextResponse.json({ places: merged, fallback: false });
  } catch {
    return NextResponse.json({
      places: generateGridCandidates(lat, lng, radius),
      fallback: true,
    });
  }
}
