import { NextRequest, NextResponse } from "next/server";
import { recommendMeetingPoints } from "@/lib/recommendation";
import { HybridRouteProvider } from "@/lib/providers/hybridRouteProvider";
import { MockRouteProvider } from "@/lib/providers/mockRouteProvider";
import { validateRecommendRequest } from "@/lib/validation";

function selectProvider() {
  const mode = process.env.ROUTING_PROVIDER_MODE ?? "mock";
  return mode === "hybrid" ? new HybridRouteProvider() : new MockRouteProvider();
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = validateRecommendRequest(raw);

    if (!parsed.ok) {
      return NextResponse.json({ message: parsed.message }, { status: 422 });
    }

    const result = await recommendMeetingPoints(selectProvider(), parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "JSON 본문 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "internal error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
