/** Vercel/Lambda 등 서버리스 Chromium 환경 */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL) || process.env.USE_SERVERLESS_CHROMIUM === "true";
}
