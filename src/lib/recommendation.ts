import {
  ParticipantInput,
  PlaceCandidate,
  RecommendationItem,
  RecommendRequest,
  RecommendResponse,
  RouteQuote
} from "@/lib/types";
import { RouteProvider } from "@/lib/providers/base";

const DEFAULT_TOP_K = 5;
const MAX_CONCURRENT_CANDIDATES = 3;
const MAX_CONCURRENT_QUOTES = 6;

type QuoteCache = Map<string, Promise<RouteQuote>>;

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

function scoreCandidate(maxDurationSec: number, totalDurationSec: number): number {
  // Lower is better: minimize longest participant time first, then total time.
  return maxDurationSec * 1_000 + totalDurationSec;
}

function makeQuoteCacheKey(participant: ParticipantInput, place: PlaceCandidate): string {
  return [
    participant.id,
    participant.mode,
    participant.origin.lat,
    participant.origin.lng,
    place.id,
    place.point.lat,
    place.point.lng
  ].join(":");
}

async function quoteWithCache(
  provider: RouteProvider,
  cache: QuoteCache,
  participant: ParticipantInput,
  place: PlaceCandidate
): Promise<RouteQuote> {
  const cacheKey = makeQuoteCacheKey(participant, place);
  const cachedQuote = cache.get(cacheKey);
  if (cachedQuote) {
    return cachedQuote;
  }

  const pendingQuote = provider.quote(participant.origin, place.point, participant.mode);
  cache.set(cacheKey, pendingQuote);

  return pendingQuote;
}

async function evaluateCandidate(
  provider: RouteProvider,
  participants: ParticipantInput[],
  place: PlaceCandidate,
  cache: QuoteCache
): Promise<RecommendationItem> {
  const details = await mapWithConcurrency(
    participants,
    MAX_CONCURRENT_QUOTES,
    async (participant) => {
      const route = await quoteWithCache(provider, cache, participant, place);
      return {
        participantId: participant.id,
        participantName: participant.name,
        route
      };
    }
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
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("topK must be a positive integer");
  }
  if (request.participants.length < 2) {
    throw new Error("participants must contain at least two people");
  }
  if (request.candidates.length === 0) {
    throw new Error("candidates must not be empty");
  }

  const quoteCache: QuoteCache = new Map();
  const evaluated = await mapWithConcurrency(
    request.candidates,
    MAX_CONCURRENT_CANDIDATES,
    async (candidate) => evaluateCandidate(provider, request.participants, candidate, quoteCache)
  );

  const recommendations = evaluated
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.min(topK, evaluated.length));
  return { recommendations };
}
