import {
  ParticipantInput,
  PlaceCandidate,
  RecommendationItem,
  RecommendRequest,
  RecommendResponse
} from "@/lib/types";
import { RouteProvider } from "@/lib/providers/base";

const DEFAULT_TOP_K = 5;

function scoreCandidate(maxDurationSec: number, totalDurationSec: number): number {
  // Lower is better: minimize longest participant time first, then total time.
  return maxDurationSec * 1_000 + totalDurationSec;
}

async function evaluateCandidate(
  provider: RouteProvider,
  participants: ParticipantInput[],
  place: PlaceCandidate
): Promise<RecommendationItem> {
  const details = await Promise.all(
    participants.map(async (participant) => {
      const route = await provider.quote(participant.origin, place.point, participant.mode);
      return {
        participantId: participant.id,
        participantName: participant.name,
        route
      };
    })
  );

  const durations = details.map((x) => x.route.durationSec);
  const maxDurationSec = Math.max(...durations);
  const totalDurationSec = durations.reduce((sum, x) => sum + x, 0);

  return {
    place,
    maxDurationSec,
    totalDurationSec,
    score: scoreCandidate(maxDurationSec, totalDurationSec),
    details
  };
}

export async function recommendMeetingPoints(
  provider: RouteProvider,
  request: RecommendRequest
): Promise<RecommendResponse> {
  const topK = request.topK ?? DEFAULT_TOP_K;
  if (request.participants.length < 2) {
    throw new Error("participants must contain at least two people");
  }
  if (request.candidates.length === 0) {
    throw new Error("candidates must not be empty");
  }

  const evaluated = await Promise.all(
    request.candidates.map((candidate) => evaluateCandidate(provider, request.participants, candidate))
  );

  const recommendations = evaluated.sort((a, b) => a.score - b.score).slice(0, topK);
  return { recommendations };
}
