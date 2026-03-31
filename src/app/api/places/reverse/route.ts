import { NextRequest, NextResponse } from "next/server";

type GoogleGeoResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
  }>;
};

function toGoogleResponse(value: unknown): GoogleGeoResponse {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as GoogleGeoResponse;
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
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ message: "lat/lng가 올바르지 않습니다." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { message: "GOOGLE_MAPS_SERVER_API_KEY가 없습니다." },
      { status: 500 }
    );
  }

  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?latlng=${lat},${lng}` +
      "&language=ko&region=kr" +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { message: `Google Geocoding API 호출이 실패했습니다. (${res.status})` },
        { status: 502 }
      );
    }

    const json = toGoogleResponse(await res.json());
    if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { message: getGoogleErrorMessage(json.status, json.error_message) },
        { status: 502 }
      );
    }

    const first = json?.results?.[0];
    const name = first?.formatted_address ?? "현재 위치";

    return NextResponse.json({ name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "역지오코딩 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
