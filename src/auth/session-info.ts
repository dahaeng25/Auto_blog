import fs from "node:fs/promises";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { hasSession, requireSession } from "./session-manager.js";

export type SessionValidity = "ok" | "expired" | "unknown";

export interface SessionInfo {
  platform: Platform;
  hasSession: boolean;
  accountId?: string;
  blogId?: string;
  valid: SessionValidity;
  message: string;
  checkedAt: string;
  verifiedAt?: string;
  verifiedValid?: boolean;
  verifiedDetail?: string;
  accountIdSource?: "session" | "env" | "unknown";
  blogIdSource?: "session" | "env" | "unknown";
}

type StorageStateLike = {
  cookies?: Array<{
    name: string;
    value: string;
    expires?: number;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>;
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

const verificationByPlatform = new Map<
  Platform,
  { verifiedAt: string; valid: boolean; detail: string }
>();

export function markSessionVerified(
  platform: Platform,
  verifiedAt: string = new Date().toISOString(),
  detail: string = "검증 성공",
): void {
  verificationByPlatform.set(platform, { verifiedAt, valid: true, detail });
}

export function markSessionVerificationFailed(
  platform: Platform,
  detail: string,
  verifiedAt: string = new Date().toISOString(),
): void {
  verificationByPlatform.set(platform, { verifiedAt, valid: false, detail });
}

export function getLastSessionVerification(
  platform: Platform,
): { verifiedAt: string; valid: boolean; detail: string } | undefined {
  return verificationByPlatform.get(platform);
}

export function getVerifiedAt(platform: Platform): string | undefined {
  return verificationByPlatform.get(platform)?.verifiedAt;
}

function toSafeString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > 200 ? s.slice(0, 200) : s;
}

function isLikelyId(s: string): boolean {
  // 세션 토큰(NID_AUT/TSSESSION 등)처럼 너무 긴 값은 제외
  if (s.length < 3 || s.length > 60) return false;
  if (/[+/=]/.test(s) && !s.includes("@")) return false;
  if (/^\d+$/.test(s)) return false; // 숫자만인 경우는 대부분 식별자 아님
  if (!/^[a-zA-Z0-9@._-]+$/.test(s)) return false;
  return true;
}

function extractFromText(text: string): {
  accountId?: string;
  blogId?: string;
} {
  // URL 패턴 기반 추출 (가장 안정적/가독성 좋음)
  const naverBlogMatch = text.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (naverBlogMatch?.[1]) {
    return { blogId: naverBlogMatch[1] };
  }

  const tistoryBlogMatch = text.match(
    /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.tistory\.com/i,
  );
  if (tistoryBlogMatch?.[1]) {
    return { blogId: tistoryBlogMatch[1] };
  }

  // 계정 ID(이메일/아이디)
  const emailMatch = text.match(
    /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/,
  );
  if (emailMatch?.[0] && isLikelyId(emailMatch[0])) {
    return { accountId: emailMatch[0] };
  }

  // JSON 문자열 같은 경우 값 내부에 userId/loginId 키가 들어있을 수 있음
  try {
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      const obj = JSON.parse(text) as unknown;
      const findInObj = (v: unknown): string | undefined => {
        if (typeof v === "string") return isLikelyId(v) ? v : undefined;
        if (Array.isArray(v)) {
          for (const item of v) {
            const r = findInObj(item);
            if (r) return r;
          }
        }
        if (v && typeof v === "object") {
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            const key = k.toLowerCase();
            if (/(login|user|account|id)\b/.test(key)) {
              const r = findInObj(val);
              if (r) return r;
            }
          }
        }
        return undefined;
      };

      const asObj = obj as unknown;
      const maybe = findInObj(asObj);
      if (maybe) return { accountId: maybe };
    }
  } catch {
    // ignore
  }

  return {};
}

export function getSessionAccountHint(
  platform: Platform,
  state: StorageStateLike,
): { accountId?: string; blogId?: string } {
  const cookies = state.cookies ?? [];
  const origins = state.origins ?? [];

  const localStorageTexts: string[] = [];
  for (const o of origins) {
    if (!o.localStorage) continue;
    for (const item of o.localStorage) {
      const v = toSafeString(item.value);
      if (v) localStorageTexts.push(v);
    }
  }

  // 쿠키 값은 토큰일 가능성이 높아, 직접 ID를 뽑기보다
  // 블로그 URL/계정 힌트가 들어있는 경우에만 제한적으로 추출합니다.
  const cookieText = cookies
    .map((c) => `${c.name}:${c.value}`)
    .join("\n")
    .slice(0, 50_000);

  const searchTexts =
    platform === "naver"
      ? [cookieText, ...localStorageTexts]
      : platform === "tistory"
        ? [cookieText, ...localStorageTexts]
        : [...localStorageTexts, cookieText];

  for (const text of searchTexts) {
    const extracted = extractFromText(text);
    if (extracted.accountId || extracted.blogId) return extracted;
  }

  return {};
}

function cookieExpiresStatus(expires: number | undefined, nowSec: number) {
  if (expires === undefined) return "unknown" as const;
  if (expires === -1) return "ok" as const; // 세션 쿠키: 만료 시각 정보가 없음
  return expires > nowSec ? ("ok" as const) : ("expired" as const);
}

export function verifySessionQuick(
  platform: Platform,
  state: StorageStateLike,
): { valid: SessionValidity; message: string } {
  const cookies = state.cookies ?? [];
  const nowSec = Math.floor(Date.now() / 1000);

  if (platform === "naver") {
    const candidates = cookies.filter((c) => c.name === "NID_AUT" || c.name === "NID_SES");
    const has = candidates.length > 0;
    if (!has) {
      return {
        valid: "expired",
        message: "필수 로그인 쿠키 없음 (NID_AUT/NID_SES)",
      };
    }

    const expiryStatuses = candidates.map((c) =>
      cookieExpiresStatus(c.expires, nowSec),
    );
    if (expiryStatuses.includes("ok")) {
      return { valid: "ok", message: "로그인 쿠키가 존재합니다 (네이버)" };
    }
    if (expiryStatuses.includes("expired")) {
      return {
        valid: "expired",
        message: "로그인 쿠키가 만료된 것으로 보입니다 (네이버)",
      };
    }
    return {
      valid: "unknown",
      message: "로그인 쿠키 상태를 판단할 수 없습니다 (네이버)",
    };
  }

  if (platform === "tistory") {
    const candidates = cookies.filter((c) => c.name === "TSSESSION");
    const has = candidates.length > 0;
    if (!has) {
      return { valid: "expired", message: "필수 로그인 쿠키 없음 (TSSESSION)" };
    }

    const expiryStatuses = candidates.map((c) =>
      cookieExpiresStatus(c.expires, nowSec),
    );
    if (expiryStatuses.includes("ok")) {
      return { valid: "ok", message: "로그인 쿠키가 존재합니다 (티스토리)" };
    }
    if (expiryStatuses.includes("expired")) {
      return {
        valid: "expired",
        message: "로그인 쿠키가 만료된 것으로 보입니다 (티스토리)",
      };
    }
    return {
      valid: "unknown",
      message: "로그인 쿠키 상태를 판단할 수 없습니다 (티스토리)",
    };
  }

  // Google: 자동 로그인 없음(세션 파일 기반)
  const anyGoogleCookie = cookies.some(
    (c) =>
      c.name === "__Secure-1PSID" || c.name === "HSID" || c.name.startsWith("SID"),
  );
  if (!anyGoogleCookie) {
    return { valid: "expired", message: "필수 로그인 쿠키 없음 (Google Blogger)" };
  }

  return { valid: "ok", message: "로그인 쿠키가 존재합니다 (Google Blogger)" };
}

async function loadSessionState(platform: Platform): Promise<StorageStateLike | null> {
  try {
    const statePath = await requireSession(platform);
    const raw = await fs.readFile(statePath, "utf-8");
    const parsed = JSON.parse(raw) as StorageStateLike;
    return parsed;
  } catch {
    return null;
  }
}

function getConfiguredLoginId(platform: Platform): string | undefined {
  if (platform === "naver") return config.naverId || undefined;
  if (platform === "tistory") {
    return config.kakaoId || config.tistoryId || undefined;
  }
  return undefined;
}

function getConfiguredBlogId(platform: Platform): string | undefined {
  if (platform === "naver") return config.naverBlogId || undefined;
  if (platform === "tistory") return config.tistoryBlogName || undefined;
  if (platform === "google") return config.bloggerBlogId || undefined;
  return undefined;
}

export async function getSessionInfo(platform: Platform): Promise<SessionInfo> {
  const checkedAt = new Date().toISOString();
  const has = await hasSession(platform);
  const verification = getLastSessionVerification(platform);
  const verifiedAt = verification?.verifiedAt;
  const verifiedValid = verification?.valid;
  const verifiedDetail = verification?.detail;

  if (!has) {
    return {
      platform,
      hasSession: false,
      valid: "unknown",
      message: `${PLATFORMS[platform].name} 세션 파일이 없습니다.`,
      checkedAt,
      verifiedAt,
      verifiedValid,
      verifiedDetail,
    };
  }

  const state = await loadSessionState(platform);
  if (!state) {
    return {
      platform,
      hasSession: true,
      valid: "unknown",
      message: `${PLATFORMS[platform].name} 세션 JSON을 읽을 수 없습니다.`,
      checkedAt,
      verifiedAt,
      verifiedValid,
      verifiedDetail,
    };
  }

  const quick = verifySessionQuick(platform, state);
  const hint = getSessionAccountHint(platform, state);

  const configuredAccountId = getConfiguredLoginId(platform);
  const configuredBlogId = getConfiguredBlogId(platform);

  const accountId =
    hint.accountId ?? (configuredAccountId ? configuredAccountId : undefined);
  const blogId = hint.blogId ?? (configuredBlogId ? configuredBlogId : undefined);

  const accountIdSource: SessionInfo["accountIdSource"] = hint.accountId
    ? "session"
    : configuredAccountId
      ? "env"
      : "unknown";
  const blogIdSource: SessionInfo["blogIdSource"] = hint.blogId
    ? "session"
    : configuredBlogId
      ? "env"
      : "unknown";

  const finalValid: SessionValidity = verification
    ? verification.valid
      ? "ok"
      : "expired"
    : quick.valid;

  let message: string;
  if (verification) {
    message = verification.valid
      ? `${PLATFORMS[platform].name} 세션 유효 (검증됨) — ${verification.detail}`
      : `${PLATFORMS[platform].name} 세션 검증 실패 — ${verification.detail}`;
  } else {
    message = quick.message;
    if (quick.valid === "ok") {
      message = `${PLATFORMS[platform].name} 세션 유효 (쿠키 기반 추정)`;
    } else if (quick.valid === "expired") {
      message = `${PLATFORMS[platform].name} 세션 만료 또는 유효하지 않음`;
    } else {
      message = `${PLATFORMS[platform].name} 세션 상태 미확인`;
    }
  }

  const usedEnvForIds =
    (accountIdSource === "env" || blogIdSource === "env") &&
    !hint.accountId &&
    !hint.blogId;
  if (usedEnvForIds) {
    message +=
      " (세션에서 계정/블로그 식별 힌트를 찾지 못해 설정값을 표시합니다.)";
  }

  return {
    platform,
    hasSession: true,
    accountId,
    blogId,
    valid: finalValid,
    message,
    checkedAt,
    verifiedAt,
    verifiedValid,
    verifiedDetail,
    accountIdSource,
    blogIdSource,
  };
}

export async function getAllSessionInfo(): Promise<Record<Platform, SessionInfo>> {
  const platforms = Object.keys(PLATFORMS) as Platform[];
  const entries = await Promise.all(
    platforms.map(async (p) => [p, await getSessionInfo(p)] as const),
  );
  return Object.fromEntries(entries) as Record<Platform, SessionInfo>;
}

