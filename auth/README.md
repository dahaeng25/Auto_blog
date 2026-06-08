# 인증 세션 파일

이 폴더에는 `npm run auth:setup` 실행 후 생성되는 세션 파일이 저장됩니다.

- `naver_state.json` — 네이버 로그인 쿠키/스토리지
- `tistory_state.json` — 티스토리 로그인 쿠키/스토리지

**주의:** 이 파일들은 `.gitignore`에 포함되어 있으며, 절대 Git에 커밋하지 마세요.

## 최초 1회 설정

```bash
npm run auth:setup
```

브라우저가 열리면 네이버 → 티스토리 순으로 직접 로그인한 뒤, 터미널 안내에 따라 Enter를 누르세요.
