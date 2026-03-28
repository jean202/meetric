# MOI Meeting Point MVP

`Node.js + Next.js + React` 기반의 모임 중간지점 추천 MVP입니다.

## 지원 이동수단
- 자차 (`car`)
- 대중교통 (`transit`)
- 자전거 (`bike`)
- 도보 (`walk`)

## 시작하기
```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## 환경변수
`.env.local` 파일을 직접 만들고 아래 값을 설정하세요.

- `ROUTING_PROVIDER_MODE=mock|hybrid`
- `NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY` (브라우저 지도 SDK용, HTTP referrer 제한 권장)
- `GOOGLE_ROUTES_API_KEY` (서버 Routes API용)
- `GOOGLE_MAPS_SERVER_API_KEY` (서버 Places/Geocoding용)

`hybrid` 모드에서는 `GOOGLE_ROUTES_API_KEY`로 Google Routes API를 사용하고,
키가 없거나 호출 실패 시 `mock` provider로 자동 fallback 됩니다.

## Google API 키 제한 가이드 (권장)
### 1) `NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY` (클라이언트)
- API restrictions: `Maps JavaScript API`만 허용
- Application restrictions: `HTTP referrers (web sites)`
- Referrer 예시:
  - `http://localhost:3000/*`
  - `http://127.0.0.1:3000/*`
  - 운영 도메인: `https://<your-domain>/*`

### 2) `GOOGLE_MAPS_SERVER_API_KEY` (서버)
- API restrictions: `Places API`, `Geocoding API`만 허용
- Application restrictions: 서버 실행 환경 기준 고정 IP가 있으면 `IP addresses` 권장
- 로컬 개발에서 고정 IP가 없으면 일시적으로 `None`으로 테스트 후, 배포 시 반드시 IP 제한 적용

### 3) `GOOGLE_ROUTES_API_KEY` (서버)
- API restrictions: `Routes API`만 허용
- Application restrictions: `IP addresses` 권장

### 4) 제한 확인 체크리스트
- Places 검색에서 `REQUEST_DENIED`가 나오면:
  - `GOOGLE_MAPS_SERVER_API_KEY`에 `Places API`가 허용되어 있는지
  - 서버 키가 Referrer 제한으로 잘못 묶여있지 않은지
- 현재 위치 역지오코딩이 실패하면:
  - 같은 서버 키에 `Geocoding API`가 허용되어 있는지
- 지도가 빈 화면이면:
  - `NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY`의 referrer 목록에 현재 origin(`http://localhost:3000`)이 포함되어 있는지
- 이동시간 계산이 mock으로 떨어지면:
  - `GOOGLE_ROUTES_API_KEY`에 `Routes API`가 허용되어 있는지

## API
### `POST /api/recommend`
요청:
```json
{
  "participants": [
    {
      "id": "p1",
      "name": "민수",
      "origin": { "lat": 37.5665, "lng": 126.978 },
      "mode": "transit"
    }
  ],
  "candidates": [
    {
      "id": "c1",
      "name": "을지로입구",
      "point": { "lat": 37.5663, "lng": 126.9822 }
    }
  ],
  "topK": 5
}
```

응답:
```json
{
  "recommendations": [
    {
      "place": { "id": "c1", "name": "을지로입구", "point": { "lat": 37.5663, "lng": 126.9822 } },
      "score": 12345,
      "maxDurationSec": 1200,
      "totalDurationSec": 3000,
      "details": []
    }
  ]
}
```

## Provider 구조
- `src/lib/providers/base.ts`: Provider 인터페이스
- `src/lib/providers/mockRouteProvider.ts`: 키 없이 실행 가능한 Mock
- `src/lib/providers/hybridRouteProvider.ts`: Google Routes API(`car/transit/bike/walk`) + fallback
