# Auto_blog

RSS 수집 → AI 원고 생성 → 썸네일 생성 → 네이버·티스토리 자동 발행 파이프라인입니다.

## 로컬 실행

```bash
npm install
npx playwright install chromium
cp .env.example .env   # API 키 등 설정
npm run auth:setup     # 네이버·티스토리 로그인 (최초 1회)
npm run web            # 웹 대시보드 + 스케줄러
```

**Windows PowerShell**에서 `npm` 실행이 막히면 아래 중 하나를 사용하세요.

```powershell
npm.cmd run web
# 또는 더블클릭
web.bat
```

브라우저에서 http://localhost:3000 접속

---

## Vercel 배포 (GitHub 연동)

### 사전 준비

1. **Turso DB** (무료) — Vercel은 파일 DB를 지원하지 않습니다.
   ```bash
   # Turso CLI 설치 후
   turso db create blog-orchestrator
   turso db show blog-orchestrator --url
   turso db tokens create blog-orchestrator
   ```

2. **Vercel Pro 권장** — 파이프라인 실행에 최대 300초 필요 (Hobby 플랜은 10초 제한)

### Vercel Hobby (무료) 제한

- 함수 메모리: 최대 **2048MB** (`vercel.json`에 반영됨)
- 함수 실행 시간: 최대 **10초** — 글 생성·발행 전체 파이프라인은 **10초 안에 끝나지 않을 수 있음**
- 전체 자동 발행이 필요하면 **로컬 `web.bat`** 또는 **Docker** 사용 권장

### GitHub → Vercel 배포 단계

1. GitHub에 저장소 push
2. [vercel.com](https://vercel.com) → **Add New Project** → GitHub 저장소 연결
3. 프로젝트 이름: `auto-blog_` 등 **기존과 겹치지 않는 이름** 사용
4. **Environment Variables** 설정:

| 변수 | 설명 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 (필수) |
| `API_KEY` | 대시보드 로그인 비밀키 (필수) |
| `TURSO_DATABASE_URL` | Turso DB URL (필수) |
| `TURSO_AUTH_TOKEN` | Turso 인증 토큰 (필수) |
| `NAVER_BLOG_ID` | 네이버 블로그 ID |
| `TISTORY_BLOG_NAME` | 티스토리 서브도메인 |
| `PUBLISH_DRY_RUN` | `false`로 설정 시 실제 발행 |
| `DISCORD_WEBHOOK_URL` | 알림 (선택) |
| `CRON_SECRET` | Vercel Cron 보안키 (Vercel이 자동 생성 가능) |

4. **Deploy** 클릭
5. 배포 완료 후 `https://your-app.vercel.app` 접속

### 세션 업로드

로컬 PC에서 `npm run auth:setup` 실행 후, 대시보드 **세션 업로드**에서 JSON 파일을 올리세요.

- `auth/naver_state.json`
- `auth/tistory_state.json`

### 자동 스케줄

`vercel.json`에 매일 **09:00 KST** (UTC 00:00) cron이 등록되어 있습니다.  
Vercel Pro 플랜에서만 300초 실행이 가능합니다.

---

## Docker 배포

```bash
docker compose up -d --build
```

자세한 내용은 Docker 섹션은 이전과 동일합니다. Turso 없이 로컬 `file:` DB를 사용합니다.

---

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run web` | 웹 대시보드 + cron (Docker/로컬) |
| `npm run start:cli` | 터미널 전용 cron |
| `npm run run:once` | 파이프라인 1회 실행 |
| `npm run auth:setup` | 네이버·티스토리 로그인 |

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/status` | 상태 조회 |
| POST | `/api/run` | 파이프라인 실행 |
| GET | `/api/articles` | 원고 목록 |
| POST | `/api/sessions/:platform` | 세션 JSON 업로드 |

`X-API-Key` 헤더에 `API_KEY` 값을 포함하세요.
