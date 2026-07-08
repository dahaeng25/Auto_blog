JSON OUTPUT SCHEMA

응답은 JSON 1건만 출력 (마크다운 코드블록 금지):

{
  "title": "[검색 의도 반영 문장형 제목] [지역명·{{BRAND_NAME}}]",
  "htmlBody": "최소 3,500자 HTML",
  "thumbnailTopLabel": "핵심 키워드 1개 5~10자",
  "thumbnailText": "선정한 제목을 2~3줄 문장으로 압축 (\\n 줄바꿈)"
}

추가 규칙:
- title은 키워드 나열 금지, 문장형 제목 1개만
- htmlBody 허용 태그: <h2>, <h3>, <p>, <ul>, <li>, <table>, <blockquote>, <thead>, <tbody>, <tr>, <th>, <td>
- 해시태그는 맨 마지막 가운데 <p>에 배치
