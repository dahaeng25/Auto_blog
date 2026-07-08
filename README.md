# Auto_blog

RSS 수집 또는 키워드 기반 생성 → AI 원고 작성/검수 → 썸네일 생성 → **네이버 · 티스토리 · Google Blogger** 자동 발행을 수행하는 블로그 자동화 프로젝트입니다.

## 핵심 변경점 (현재 구조)

- 기본 운영 UI를 **웹 대시보드**(`public/index.html`) 기준으로 통합
- 브랜드 정보(`강운준 행정사`, `1844-1346` 등)를 `config/brand.ts`로 중앙화
- Gems 프롬프트를 `persona / structure / content-rules / output-schema`로 분리하고 로더에서 조합
- LLM(OpenAI/Gemini) 및 발행 단계에 **재시도 + 로그 레벨 정리** 적용
- 발행 성공 URL을 `published_posts`에 저장하고 대시보드에 최근 이력 표시

---

## 빠른 시작 (로컬)

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run auth:setup
npm run web
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

Windows PowerShell에서 `npm` 실행이 막히면:

```powershell
npm.cmd run web
# 또는
web.bat
```

---

## Docker 실행 (권장)

상세 가이드: [docs/DOCKER.md](docs/DOCKER.md)

```bash
cp .env.docker.example .env
npm install && npx playwright install chromium
npm run auth:setup
docker compose up -d --build
```

대시보드: [http://localhost:3000](http://localhost:3000)

---

## 환경변수 가이드

실제 키는 `.env`에 설정하고, 기본 템플릿은 `.env.example`을 사용하세요.

### 1) 브랜드 통합 설정

- `BRAND_NAME` (기본: `강운준 행정사`)
- `BRAND_OFFICE_NAME` (기본: `행정사사무소 다행`)
- `CONTACT_PHONE` (기본: `1844-1346`)

위 값은 프롬프트/썸네일/스타일 전반에 공통 적용됩니다.

### 2) LLM/재시도

- `LLM_PROVIDER` = `openai` | `gemini`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `LLM_RETRY_ATTEMPTS` (기본 3)
- `LLM_RETRY_DELAY_MS` (기본 900)

### 3) 퍼블리싱/재시도

- `PUBLISH_DRY_RUN`, `PUBLISH_HEADLESS`, `PUBLISH_SKIP_THUMBNAIL`
- `PUBLISH_RETRY_ATTEMPTS` (기본 2)
- `PUBLISH_RETRY_DELAY_MS` (기본 2000)
- `ENABLE_NAVER_PUBLISH`, `ENABLE_TISTORY_PUBLISH`, `ENABLE_GOOGLE_PUBLISH`

### 4) 블로그 식별자

- `NAVER_BLOG_ID`
- `TISTORY_BLOG_NAME`
- `BLOGGER_BLOG_ID`

---

## 프롬프트 구조

`prompts/` 디렉토리:

- `persona.prompt.md`
- `structure.prompt.md`
- `content-rules.prompt.md`
- `output-schema.prompt.md`
- `gems-system.prompt.md` (레거시 fallback)

런타임 로더 `src/content/llm/gems-prompt-loader.ts`가 분리 프롬프트를 우선 조합하고, 누락 시 레거시 파일로 폴백합니다.

---

## 웹 대시보드 기능

- 파이프라인 상태/로그/통계 조회
- 키워드 입력 + 히스토리 자동완성
- 원고 미리보기 + 본문 글자수(최소 기준 대비) 확인
- 세션 업로드(`auth/*_state.json`) 및 **자동 재로그인 시도** 버튼
- 최근 발행 이력(플랫폼 배지 + URL 바로가기)
- 단계 진행 상태(수집/생성/썸네일/발행) 및 실패 카드 표시

---

## 주요 스크립트

- `npm run web`: 웹 대시보드 + cron (로컬/Docker)
- `npm run start:cli`: CLI 스케줄 실행
- `npm run run:once`: 파이프라인 1회 실행
- `npm run auth:setup`: 플랫폼 로그인 세션 생성
- `npm run blog:workflow`: 단계별 워크플로우 실행

---

## 주요 API

- `GET /api/status`: 현재 상태, 설정, 세션 상태
- `POST /api/run`: 파이프라인 실행
- `GET /api/articles`: 원고 목록
- `GET /api/articles/:id`: 원고 상세
- `GET /api/published-posts`: 최근 발행 이력
- `GET /api/input-history`: 키워드/지역 입력 히스토리
- `POST /api/sessions/:platform`: 세션 JSON 업로드
- `POST /api/sessions/:platform/refresh`: 세션 자동 재로그인 시도

---

## 세션 자동 갱신 설정 (수동 업로드 최소화)

Vercel 프로젝트 환경변수에 `NAVER_ID`, `NAVER_PASSWORD`, `KAKAO_ID`, `KAKAO_PASSWORD`, `AUTH_AUTO_LOGIN=true` 를 등록하면, 저장된 세션이 만료돼도 다음 실행 시 자동으로 재로그인해서 세션을 갱신합니다.

최초 1회는 세션 파일이 아예 없으므로 대시보드에서 업로드하거나, `AUTH_AUTO_LOGIN=true` + 계정 정보만 있으면 최초 실행 시에도 자동 로그인을 시도합니다.

네이버가 보안문자/2단계 인증을 요구하면 자동 로그인이 실패하며, 이 경우에만 수동 세션 재업로드가 필요합니다 (플랫폼 보안 정책상 완전 우회 불가).

대시보드 **세션 업로드** 섹션의 **자동 재로그인 시도** 버튼으로 파이프라인 실행 없이 즉시 세션 갱신을 시도할 수 있습니다.

---

## Vercel 배포 (요약)

1. Turso DB 준비 (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)
2. Vercel 프로젝트 연결
3. 환경변수 설정 후 배포 (`NAVER_ID`, `NAVER_PASSWORD`, `KAKAO_ID`, `KAKAO_PASSWORD`, `AUTH_AUTO_LOGIN=true` — [세션 자동 갱신](#세션-자동-갱신-설정-수동-업로드-최소화) 참고)
4. 최초 1회 세션 업로드 또는 자동 로그인 시도

> 참고: Vercel Hobby는 함수 시간 제한이 짧아 전체 자동 발행이 불안정할 수 있습니다. 안정 운영은 로컬/Docker를 권장합니다.
