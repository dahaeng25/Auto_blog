# 썸네일 브랜드 템플릿 (blue_directors 샘플 기준)

메인 썸네일은 **고정 디자인** + **thumbnailText 문구만** 매번 변경됩니다.

## 현재 기본값

| 항목 | 값 |
|------|-----|
| 크기 | 886×886px (네이버 1:1) |
| 폰트 | Nanum Gothic 800 |
| 배경 | 네이비 그라데이션 |
| 장식 | 상·하단 골드 바, 텍스트 박스 테두리 |

설정 파일: `assets/thumbnail/brand.json`  
본문 폰트·구성: `config/blog-style.json`

## 샘플과 더 비슷하게

1. 샘플 썸네일 캡처 → `bg.png` 저장
2. `brand.json`에서 `"background": { "type": "image", "image": "assets/thumbnail/bg.png" }`

## 테스트

```powershell
npm.cmd run thumbnail:test
```

출력: `output/thumbnails/thumbnail_최종.png`
