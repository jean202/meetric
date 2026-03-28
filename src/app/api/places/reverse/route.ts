import { NextRequest, NextResponse } from "next/server";

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
    const json = await res.json();

    const first = json?.results?.[0];
    const name = first?.formatted_address ?? "현재 위치";

    return NextResponse.json({ name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "역지오코딩 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
