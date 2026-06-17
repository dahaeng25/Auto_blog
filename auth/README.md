# 인증 세션 파일

이 폴더에는 로그인 세션 파일이 저장됩니다.

- `naver_state.json` — 네이버 로그인 쿠키/스토리지
- `tistory_state.json` — 티스토리 로그인 쿠키/스토리지

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

## 수동 로그인 (캡차/2단계 인증 시)

자동 로그인이 실패하면 (캡차, OTP 등):

```powershell
npm.cmd run auth:setup
```

브라우저에서 직접 로그인 후 Enter를 누르세요.

## 세션 확인

```powershell
npm.cmd run auth:verify
```
