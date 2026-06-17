# Docker로 블로그 자동화 실행하기

Vercel 대신 **Docker**를 쓰면 Playwright·파일 저장·스케줄러가 로컬과 동일하게 동작합니다.

## 권장 순서

1. **골격(Docker + 3플랫폼)** ← 지금 단계  
2. **프롬프트·이미지 배치** — 파이프라인이 돌아가는 환경에서 반복 개선  
3. (차후) SaaS 멀티테넌트·결제

프롬프트를 먼저 완벽히 맞추기보다, **동작하는 Docker 환경**에서 글을 생성·발행해 보며 `prompts/gems-system.prompt.md` 와 `config/image-manifest.json` 을 조정하는 편이 효율적입니다.

---

## 1. 사전 준비

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치
- OpenAI API 키
- 네이버·티스토리·Blogger 블로그 ID

| 플랫폼 | 환경 변수 | ID 확인 방법 |
|--------|-----------|--------------|
| 네이버 | `NAVER_BLOG_ID` | 블로그 URL `blog.naver.com/여기` |
| 티스토리 | `TISTORY_BLOG_NAME` | `여기.tistory.com` 서브도메인 |
| Google Blogger | `BLOGGER_BLOG_ID` | Blogger → 설정 → 기본 페이지 URL의 **숫자** ID |

---

## 2. 설정

```bash
cp .env.docker.example .env
# .env 편집 — OPENAI_API_KEY, 블로그 ID, BLOG_TOPIC 등
```

발행하지 않고 테스트만 할 때:

```env
PUBLISH_DRY_RUN=true
```

---

## 3. 세션 생성 (최초 1회)

Docker **밖**에서 브라우저 창이 필요합니다.

```bash
npm install
npx playwright install chromium
npm run auth:setup
```

생성 파일:

- `auth/naver_state.json`
- `auth/tistory_state.json`
- `auth/google_state.json` (ENABLE_GOOGLE_PUBLISH=true 일 때)

`docker-compose.yml` 이 `./auth` 를 마운트하므로 컨테이너가 같은 세션을 사용합니다.

---

## 4. 실행

```bash
docker compose up -d --build
```

- 대시보드: http://localhost:3000  
- 로그: `docker compose logs -f`  
- 중지: `docker compose down`

---

## 5. 일상 운영

| 작업 | 명령 |
|------|------|
| 수동 1회 실행 | 대시보드 → 블로그 주제 입력 → 실행 |
| 자동 스케줄 | `CRON_SCHEDULE` (기본 매일 09:00 KST) |
| 세션 만료 | 호스트에서 `npm run auth:setup` 재실행 |
| 원고·썸네일 | `./output/` 폴더 |
| DB | `./data/blog.db` |

---

## 6. 플랫폼 on/off

`.env` 에서 개별 비활성화:

```env
ENABLE_GOOGLE_PUBLISH=false
```

---

## 7. Vercel과 병행하지 않기

- **운영(발행)**: Docker  
- **Vercel**: 데모 대시보드만 쓰거나 제거 권장  

Turso·세션 업로드는 Vercel 전용이며 Docker에서는 필요 없습니다.

---

## 문제 해결

| 증상 | 조치 |
|------|------|
| 세션 만료 | `npm run auth:setup` |
| Google만 실패 | Blogger UI 변경 가능 — `config/editor-selectors.ts` 의 `google` 섹션 조정 |
| 메모리 부족 | Docker Desktop RAM 4GB 이상 권장 |
| cron 미동작 | `ENABLE_WEB_SCHEDULER=true` 확인 |
