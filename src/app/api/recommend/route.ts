import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommendMeetingPoints } from "@/lib/recommendation";
import { HybridRouteProvider } from "@/lib/providers/hybridRouteProvider";
import { MockRouteProvider } from "@/lib/providers/mockRouteProvider";

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const participantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  origin: pointSchema,
  mode: z.enum(["car", "transit", "bike", "walk"]),
});

const candidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  point: pointSchema,
  category: z.string().optional(),
});

const requestSchema = z.object({
  participants: z.array(participantSchema).min(2).max(20),
  candidates: z.array(candidateSchema).min(1).max(50),
  topK: z.number().int().min(1).max(20).optional(),
});

function selectProvider() {
  const mode = process.env.ROUTING_PROVIDER_MODE ?? "mock";
  return mode === "hybrid" ? new HybridRouteProvider() : new MockRouteProvider();
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = requestSchema.safeParse(raw);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return NextResponse.json({ message: `입력 검증 실패: ${issues}` }, { status: 400 });
    }

    const result = await recommendMeetingPoints(selectProvider(), parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal error";
    return NextResponse.json({ message }, { status: 400 });
  }
}
