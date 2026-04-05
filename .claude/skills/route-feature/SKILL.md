---
name: route-feature
description: Meetric에 새 기능을 추가한다. 경로 탐색/지도 관련 Next.js 앱.
argument-hint: "[기능 설명 - 예: 대중교통 경로 비교 UI]"
---

## Meetric 기능 추가

대상: **$ARGUMENTS**

### 프로젝트 정보
- Next.js 15 + React 19 + TypeScript + Zod
- Google Maps/Routes API 연동
- 하이브리드 라우팅: Google Routes API → Mock Provider 폴백

### 구현 순서
1. **Provider** — `lib/providers/`에 데이터 제공자 추가/수정
2. **컴포넌트** — `components/`에 UI 추가
3. **페이지** — `app/`에 라우트 추가
4. **타입** — Zod 스키마로 입력 검증

### 교통수단 지원
- car, transit, bike, walk
