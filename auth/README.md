# 인증 세션 파일

이 폴더에는 로그인 세션 파일이 저장됩니다.

- `naver_state.json` — 네이버 로그인 쿠키/스토리지
- `tistory_state.json` — 티스토리 로그인 쿠키/스토리지
- `google_state.json` — Google Blogger 로그인 쿠키/스토리지

**주의:** 이 파일들은 `.gitignore`에 포함되어 있으며, 절대 Git에 커밋하지 마세요.

## 자동 로그인 (권장)

`.env`에 계정을 설정하면 세션 만료 시 **발행 직전 자동으로 재로그인**합니다.

```env
AUTH_AUTO_LOGIN=true

NAVER_ID=네이버아이디
NAVER_PASSWORD=네이버비밀번호

KAKAO_ID=카카오이메일또는아이디
KAKAO_PASSWORD=카카오비밀번호
```

이후 평소처럼 `npm run run:once`만 실행하면 됩니다.

## 수동 로그인 (캡차/2단계 인증 시) — **권장**

OTP·SMS·캡차는 **완전 자동 입력을 지원하지 않습니다** (보안·정책상 불가).
대신 아래 방법을 사용하세요.

### 방법 1: 세션 한 번 저장 (가장 안정적)

```powershell
npm.cmd run auth:setup
```

브라우저가 열리면 네이버·티스토리에 **직접 로그인**(2단계 인증 포함) 후 Enter.
`auth/naver_state.json`, `auth/tistory_state.json`이 생성되며 이후 수 주간 재사용됩니다.

### 방법 2: 자동 로그인 + 브라우저에서 2단계 인증

`.env` 설정:

```env
AUTH_AUTO_LOGIN=true
AUTH_LOGIN_HEADLESS=false
AUTH_2FA_WAIT_MS=180000
```

세션 만료 시 ID/PW 자동 입력 후, 2단계 인증 화면이 나오면 **열린 브라우저에서 직접 완료**하면 됩니다 (최대 3분 대기).

## Vercel 웹 「계정 연결」 한계

Vercel은 **headed 브라우저를 띄울 수 없습니다** (디스플레이 없음 → 항상 headless Chromium).

| 환경 | 동작 |
|------|------|
| **로컬** `npm run web` / `auth:setup` | 창이 보이는 headed — `auth-setup.bat`과 동일하게 2FA 푸시가 잘 옴 |
| **Vercel 대시보드 연결** | headless — 스텔스·키보드 입력·클릭 타임아웃으로 최대한 맞춤. 그래도 네이버가 봇으로 막으면 2FA가 안 올 수 있음 |

Vercel에서 연결이 막히면:

1. 로컬에서 `auth-setup.bat` 또는 `npm run auth:setup`으로 로그인
2. 대시보드「세션 업로드」로 `auth/naver_state.json` 업로드
3. 또는 로컬 `npm run web`에서 「브라우저에서 직접 로그인」 사용

## 세션 확인

```powershell
npm.cmd run auth:verify
```
