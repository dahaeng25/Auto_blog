# Playwright + Node.js 런타임
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# 의존성 설치 (캐시 활용)
COPY package.json package-lock.json ./
RUN npm ci

# 소스 복사
COPY . .

# Chromium은 베이스 이미지에 포함되어 있음
ENV NODE_ENV=production
ENV PUBLISH_HEADLESS=true
ENV PORT=3000

# 영구 데이터 디렉토리
VOLUME ["/app/data", "/app/auth", "/app/output"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "run", "web"]
