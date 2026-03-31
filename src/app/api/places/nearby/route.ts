import { NextRequest, NextResponse } from "next/server";
import { PlaceCandidate } from "@/lib/types";

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

function toGoogleResponse(value: unknown): GoogleNearbyResponse {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as GoogleNearbyResponse;
}

function toCandidate(raw: GoogleNearbyResult): PlaceCandidate | null {
  const lat = raw.geometry?.location?.lat;
  const lng = raw.geometry?.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: raw.place_id ?? `${lat}-${lng}`,
    name: raw.name ?? raw.vicinity ?? "알 수 없는 장소",
    point: { lat: lat!, lng: lng! },
    category: raw.types?.[0]
  };
}

function getGoogleErrorMessage(status?: string, errorMessage?: string): string {
  if (status === "REQUEST_DENIED") {
    return `Google API 요청이 거부되었습니다. 키 제한(Referrer/IP) 및 API 활성화 상태를 확인하세요.${
      errorMessage ? ` (${errorMessage})` : ""
    }`;
  }

  if (status === "OVER_QUERY_LIMIT") {
    return "Google API 할당량을 초과했습니다. 프로젝트 quota를 확인하세요.";
  }

  return `Google API 응답 상태가 비정상입니다: ${status ?? "UNKNOWN"}`;
}

function generateGridCandidates(lat: number, lng: number, radiusM: number): PlaceCandidate[] {
  const candidates: PlaceCandidate[] = [];
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
        point: { lat: Number(cLat.toFixed(6)), lng: Number(cLng.toFixed(6)) }
      });
    }
  }

  candidates.push({
    id: "grid-center",
    name: "중간 지점",
    point: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
  });

  return candidates;
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const requestedRadius = Number(req.nextUrl.searchParams.get("radius")) || 3000;
  const radius = Math.min(8000, Math.max(1200, Math.round(requestedRadius)));
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { message: "lat/lng가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  if (!apiKey) {
    return NextResponse.json({
      places: generateGridCandidates(lat, lng, radius),
      fallback: true
    });
  }

  try {
    const stationUrl =
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
      `?location=${lat},${lng}` +
      `&radius=${radius}` +
      "&type=subway_station" +
      "&language=ko" +
      `&key=${encodeURIComponent(apiKey)}`;

    const cafeUrl =
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
      `?location=${lat},${lng}` +
      `&radius=${Math.round(radius * 0.7)}` +
      "&type=cafe" +
      "&language=ko" +
      `&key=${encodeURIComponent(apiKey)}`;

    const [stationRes, cafeRes] = await Promise.all([
      fetch(stationUrl, { cache: "no-store" }),
      fetch(cafeUrl, { cache: "no-store" })
    ]);

    if (!stationRes.ok || !cafeRes.ok) {
      throw new Error(
        `Google Nearby Search 호출이 실패했습니다. (${stationRes.status}/${cafeRes.status})`
      );
    }

    const stationJson = toGoogleResponse(await stationRes.json());
    const cafeJson = toGoogleResponse(await cafeRes.json());

    const responses = [stationJson, cafeJson];
    for (const response of responses) {
      if (response.status && response.status !== "OK" && response.status !== "ZERO_RESULTS") {
        throw new Error(getGoogleErrorMessage(response.status, response.error_message));
      }
    }

    const stations = (stationJson.results ?? [])
      .map(toCandidate)
      .filter((candidate): candidate is PlaceCandidate => candidate !== null)
      .slice(0, 5);

    const cafes = (cafeJson.results ?? [])
      .map(toCandidate)
      .filter((candidate): candidate is PlaceCandidate => candidate !== null)
      .slice(0, 3);

    const seen = new Set<string>();
    const merged: PlaceCandidate[] = [];
    for (const candidate of [...stations, ...cafes]) {
      if (!seen.has(candidate.id)) {
        seen.add(candidate.id);
        merged.push(candidate);
      }
    }

    if (merged.length === 0) {
      return NextResponse.json({
        places: generateGridCandidates(lat, lng, radius),
        fallback: true
      });
    }

    return NextResponse.json({ places: merged, fallback: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "근처 장소 후보를 가져오지 못했습니다.";

    return NextResponse.json({
      places: generateGridCandidates(lat, lng, radius),
      fallback: true,
      message
    });
  }
}
