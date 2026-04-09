"use client";

import { useState } from "react";
import type { PlaceCandidate, RecommendationItem } from "@/lib/types";
import type { ParticipantDraft } from "./types";
import { buildShareText, formatDuration, getRecommendationHint } from "./utils";

type Props = {
  participants: ParticipantDraft[];
  activeId: string;
  candidatePlaces: PlaceCandidate[];
  candidateFallback: boolean;
  candidateLoading: boolean;
  candidateError: string | null;
  recommendations: RecommendationItem[];
  recommendLoading: boolean;
  recommendError: string | null;
  featuredRecommendation?: RecommendationItem;
  confirmedCount: number;
  onSelectRecommendation: (placeId: string) => void;
  onChipClick: (participantId: string) => void;
  onAddParticipant: () => void;
};

export default function RecommendPanel({
  participants,
  activeId,
  candidatePlaces,
  candidateFallback,
  candidateLoading,
  candidateError,
  recommendations,
  recommendLoading,
  recommendError,
  featuredRecommendation,
  confirmedCount,
  onSelectRecommendation,
  onChipClick,
  onAddParticipant,
}: Props) {
  const [shareToast, setShareToast] = useState(false);

  const handleShare = async () => {
    if (!featuredRecommendation) return;

    const text = buildShareText(featuredRecommendation, confirmedCount);

    if (navigator.share) {
      try {
        await navigator.share({ title: "모임 추천 장소", text });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(text);
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2000);
  };

  return (
    <div className="sheet">
      <p className="sheetEyebrow">추천 장소</p>
      <h3>
        {candidateLoading || recommendLoading
          ? "추천 계산 중..."
          : featuredRecommendation?.place.name ?? "출발지를 더 설정해 주세요"}
      </h3>
      <p className="dateText">
        {candidateError ??
          recommendError ??
          getRecommendationHint({
            recommendation: featuredRecommendation,
            candidateCount: candidatePlaces.length,
            candidateFallback,
          })}
      </p>

      <div className="activeBadgeWrap">
        <span className="activeBadge">
          {featuredRecommendation
            ? `최대 이동 ${formatDuration(featuredRecommendation.maxDurationSec)} · 총 이동 ${formatDuration(featuredRecommendation.totalDurationSec)}`
            : `확정된 출발지 ${confirmedCount}명`}
        </span>
      </div>

      <div className="originChips">
        {participants.map((p) => (
          <button
            key={p.id}
            className={`chip${p.id === activeId ? " active" : ""}`}
            onClick={() => onChipClick(p.id)}
          >
            {p.originLabel ?? `${p.name} 출발지`}
          </button>
        ))}
      </div>

      <div className="detailList">
        {featuredRecommendation ? (
          featuredRecommendation.details.map((detail) => (
            <div key={detail.participantId} className="detailRow">
              <span className="detailLabel">{detail.participantName}</span>
              <span className="detailValue">{formatDuration(detail.route.durationSec)}</span>
            </div>
          ))
        ) : (
          <p className="detailEmpty">출발지를 2곳 이상 확정하면 추천 결과를 보여줍니다.</p>
        )}
      </div>

      {recommendations.length > 1 ? (
        <div className="recommendationList">
          {recommendations.map((item, index) => (
            <button
              key={item.place.id}
              type="button"
              className={`recommendationItem${
                item.place.id === featuredRecommendation?.place.id ? " active" : ""
              }`}
              onClick={() => onSelectRecommendation(item.place.id)}
            >
              <span className="recommendationRank">{index + 1}</span>
              <div className="recommendationInfo">
                <strong>{item.place.name}</strong>
                <span>
                  최대 {formatDuration(item.maxDurationSec)} · 총 {formatDuration(item.totalDurationSec)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="sheetActions">
        <button className="addBtn" onClick={onAddParticipant}>
          출발지 추가하기
        </button>
        <button
          className="shareBtn"
          aria-label="공유"
          disabled={!featuredRecommendation}
          onClick={handleShare}
        >
          ⤴
        </button>
      </div>

      {shareToast ? <p className="shareToast">클립보드에 복사되었습니다</p> : null}
    </div>
  );
}
