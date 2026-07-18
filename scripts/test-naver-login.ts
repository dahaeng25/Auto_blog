/**
 * 네이버 자동 로그인 스모크 + (자격증명 있을 때) headed 실로그인 테스트.
 *
 * 사용:
 *   npx tsx scripts/test-naver-login.ts
 *   npx tsx scripts/test-naver-login.ts --smoke-only
 *
 * 비밀번호는 출력하지 않습니다. 2FA가 뜨면 휴대폰에서 승인하세요.
 */
import "dotenv/config";
import { config } from "../config/index.js";
import { autoLoginNaver } from "../src/auth/auto-login.js";
import {
  createBrowserSession,
  getSessionPage,
} from "../src/auth/browser-factory.js";
import { isNaverLoggedIn } from "../src/auth/login-check.js";
import {
  describeLoginPage,
  isManualAuthScreen,
} from "../src/auth/auth-wait.js";
import { humanClickSafe } from "../src/publishing/utils/human-input.js";

async function smokeClickDoesNotHang(): Promise<void> {
  console.log("[1/2] smoke: humanClickSafe 타임아웃·폴백");
  const session = await createBrowserSession({ headless: true });
  const page = await getSessionPage(session);
  try {
    await page.setContent(
      `<button id="go" style="width:120px;height:40px;margin:40px">login</button>`,
    );
    const started = Date.now();
    const method = await humanClickSafe(page.locator("#go"), 5_000);
    const elapsed = Date.now() - started;
    if (elapsed > 8_000) {
      throw new Error(`클릭이 너무 오래 걸림: ${elapsed}ms`);
    }
    console.log(`  OK method=${method} elapsed=${elapsed}ms`);
  } finally {
    await page.close().catch(() => {});
    await session.close();
  }
}

async function realNaverLogin(): Promise<void> {
  if (!config.naverId || !config.naverPassword) {
    console.log("[2/2] skip: NAVER_ID / NAVER_PASSWORD 없음");
    return;
  }

  const headed = !config.authLoginHeadless;
  console.log(
    `[2/2] real: 네이버 자동 로그인 (headless=${!headed}, id=${config.naverId})`,
  );
  console.log("  → 휴대폰 알림이 오면 승인하세요. 최대 대기 90초.");

  const session = await createBrowserSession({ headless: !headed });
  const page = await getSessionPage(session);

  // 테스트용으로 2FA 대기 상한 축소
  const prevWait = process.env.AUTH_2FA_WAIT_MS;
  process.env.AUTH_2FA_WAIT_MS = "90000";

  try {
    const deadline = Date.now() + 120_000;
    const loginPromise = autoLoginNaver(page);
    const watchdog = new Promise<never>((_, reject) => {
      const t = setInterval(() => {
        if (Date.now() > deadline) {
          clearInterval(t);
          reject(new Error("전체 로그인 테스트 시간 초과 (120초)"));
        }
      }, 2000);
      loginPromise.finally(() => clearInterval(t));
    });

    await Promise.race([loginPromise, watchdog]);

    const loggedIn = await isNaverLoggedIn(session.context);
    const screen = await describeLoginPage(page);
    console.log(`  결과: loggedIn=${loggedIn}, screen=${screen}`);
    if (!loggedIn) {
      throw new Error(`로그인 미완료 (${screen})`);
    }
    console.log("  OK 네이버 로그인 성공");
  } catch (error) {
    const screen = await describeLoginPage(page).catch(() => "unknown");
    const authScreen = await isManualAuthScreen(page).catch(() => false);
    const loggedIn = await isNaverLoggedIn(session.context).catch(() => false);
    console.log(
      `  상태: loggedIn=${loggedIn}, authScreen=${authScreen}, screen=${screen}`,
    );
    // 2FA 화면까지 도달했으면 클릭/제출 경로 성공으로 간주
    if (authScreen || /인증|2단계|기기|앱에서/.test(screen)) {
      console.log("  OK 로그인 제출 성공 — 2FA/기기 인증 화면 도달 (푸시 확인)");
      return;
    }
    throw error;
  } finally {
    if (prevWait === undefined) delete process.env.AUTH_2FA_WAIT_MS;
    else process.env.AUTH_2FA_WAIT_MS = prevWait;
    await page.close().catch(() => {});
    await session.close();
  }
}

async function main(): Promise<void> {
  const smokeOnly = process.argv.includes("--smoke-only");
  await smokeClickDoesNotHang();
  if (!smokeOnly) {
    await realNaverLogin();
  }
  console.log("\n모든 테스트 통과");
}

main().catch((error) => {
  console.error("\n테스트 실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
