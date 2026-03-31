import { NextRequest, NextResponse } from "next/server";

type PlaceSuggestion = {
  id: string;
  name: string;
  address?: string;
  point: { lat: number; lng: number };
};

type GoogleApiLocation = {
  lat?: number;
  lng?: number;
};

type GoogleApiResult = {
  place_id?: string;
  id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: {
    location?: GoogleApiLocation;
  };
};

type GoogleApiResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleApiResult[];
};

function toPlacesResult(raw: GoogleApiResult[]): PlaceSuggestion[] {
  return raw
    .filter((item) => Number.isFinite(item.geometry?.location?.lat) && Number.isFinite(item.geometry?.location?.lng))
    .slice(0, 6)
    .map((item) => ({
      id: String(item.place_id ?? item.id ?? `${item.name}-${item.formatted_address}`),
      name: item.name ?? item.formatted_address ?? "알 수 없는 장소",
      address: item.formatted_address,
      point: {
        lat: Number(item.geometry?.location?.lat),
        lng: Number(item.geometry?.location?.lng)
      }
    }));
}

function toGeocodeResult(raw: GoogleApiResult[]): PlaceSuggestion[] {
  return raw
    .filter((item) => Number.isFinite(item.geometry?.location?.lat) && Number.isFinite(item.geometry?.location?.lng))
    .slice(0, 6)
    .map((item) => ({
      id: String(item.place_id ?? item.id ?? item.formatted_address),
      name: item.formatted_address ?? "알 수 없는 장소",
      address: item.formatted_address,
      point: {
        lat: Number(item.geometry?.location?.lat),
        lng: Number(item.geometry?.location?.lng)
      }
    }));
}

function toGoogleResponse(value: unknown): GoogleApiResponse {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as GoogleApiResponse;
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

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

  if (!query || query.length < 2) {
    return NextResponse.json({ places: [] });
  }

  if (query.length > 80) {
    return NextResponse.json({ message: "검색어는 80자 이하로 입력해 주세요." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { message: "GOOGLE_MAPS_SERVER_API_KEY가 없습니다." },
      { status: 500 }
    );
  }

  try {
    const placeUrl =
      "https://maps.googleapis.com/maps/api/place/textsearch/json" +
      `?query=${encodeURIComponent(query)}` +
      "&language=ko&region=kr" +
      `&key=${encodeURIComponent(apiKey)}`;

    const placeRes = await fetch(placeUrl, { cache: "no-store" });
    if (!placeRes.ok) {
      return NextResponse.json(
        { message: `Google Places API 호출이 실패했습니다. (${placeRes.status})` },
        { status: 502 }
      );
    }

    const placeJson = toGoogleResponse(await placeRes.json());

    if (
      placeJson.status &&
      placeJson.status !== "OK" &&
      placeJson.status !== "ZERO_RESULTS"
    ) {
      return NextResponse.json(
        { message: getGoogleErrorMessage(placeJson.status, placeJson.error_message) },
        { status: 502 }
      );
    }

    const placeResults = toPlacesResult(placeJson.results ?? []);

    if (placeResults.length > 0) {
      return NextResponse.json({ places: placeResults });
    }

    const geocodeUrl =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(query)}` +
      "&language=ko&region=kr" +
      `&key=${encodeURIComponent(apiKey)}`;

    const geoRes = await fetch(geocodeUrl, { cache: "no-store" });
    if (!geoRes.ok) {
      return NextResponse.json(
        { message: `Google Geocoding API 호출이 실패했습니다. (${geoRes.status})` },
        { status: 502 }
      );
    }

    const geoJson = toGoogleResponse(await geoRes.json());

    if (geoJson.status && geoJson.status !== "OK" && geoJson.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { message: getGoogleErrorMessage(geoJson.status, geoJson.error_message) },
        { status: 502 }
      );
    }

    const geoResults = toGeocodeResult(geoJson.results ?? []);

    return NextResponse.json({ places: geoResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "장소 검색 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
