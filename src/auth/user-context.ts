import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthUser {
  id: number;
  username: string;
}

const storage = new AsyncLocalStorage<AuthUser>();

/** 현재 요청의 인증 사용자 컨텍스트로 실행 */
export function runWithUser<T>(user: AuthUser, fn: () => T): T {
  return storage.run(user, fn);
}

export function getCurrentUser(): AuthUser | undefined {
  return storage.getStore();
}

export function getCurrentUserId(): number | undefined {
  return storage.getStore()?.id;
}

/** 파이프라인·저장소에서 사용 — 컨텍스트 없으면 예외 */
export function requireUserId(): number {
  const id = getCurrentUserId();
  if (id == null) {
    throw new Error(
      "인증된 사용자가 없습니다. 로그인 후 다시 시도하거나 runWithUser로 userId를 전달하세요.",
    );
  }
  return id;
}

/**
 * Node ALS에 사용자 주입.
 * Fastify onRequest 에서는 enterWith 대신 runWithUser(user, done) 를 쓰세요.
 * (Vercel inject 경로에서 enterWith 컨텍스트가 핸들러까지 전파되지 않을 수 있음)
 */
export function enterUserContext(user: AuthUser): void {
  storage.enterWith(user);
}
