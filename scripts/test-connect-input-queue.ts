/**
 * 연결 입력 큐 enqueue → drain 스모크 테스트.
 * 실제 Playwright 없이 DB 큐·job interactive 플래그 경로를 검증합니다.
 *
 * 실행: npx tsx scripts/test-connect-input-queue.ts
 */
import { connectInputStore } from "../src/api/connect-input-store.js";
import { connectJobStore } from "../src/api/connect-job-store.js";
import { runWithUser } from "../src/auth/user-context.js";

const TEST_USER = { id: 9_001_771, username: "connect-input-smoke" };
const PLATFORM = "naver" as const;

async function assert(cond: boolean, msg: string): Promise<void> {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  await runWithUser(TEST_USER, async () => {
    await connectJobStore.markConnecting(PLATFORM, "auto");
    let job = await connectJobStore.get(PLATFORM);
    await assert(job.status === "connecting", "markConnecting failed");
    await assert(job.interactive === false, "interactive should start false");

    await connectJobStore.enableInteractive(PLATFORM);
    job = await connectJobStore.get(PLATFORM);
    await assert(job.interactive === true, "enableInteractive failed");

    // appendStep 이 interactive 를 덮어쓰지 않는지 검증
    await connectJobStore.appendStep(PLATFORM, "진행 로그 (스크린샷 없음)");
    job = await connectJobStore.get(PLATFORM);
    await assert(
      job.interactive === true,
      "appendStep without screenshot must preserve interactive=1",
    );

    const fakeFrame = Buffer.from("fake-jpeg-frame");
    await connectJobStore.updateInteractiveFrame(PLATFORM, fakeFrame);
    job = await connectJobStore.get(PLATFORM);
    await assert(job.interactive === true, "updateInteractiveFrame interactive");
    await assert(Boolean(job.screenshotBase64), "screenshot missing");

    // 스크린샷 없는 appendStep 이 프레임을 지우지 않는지
    const beforeShot = job.screenshotBase64;
    await connectJobStore.appendStep(PLATFORM, "또 다른 로그");
    job = await connectJobStore.get(PLATFORM);
    await assert(
      job.screenshotBase64 === beforeShot,
      "appendStep must not wipe interactive screenshot",
    );
    await assert(job.interactive === true, "interactive wiped by appendStep");

    await connectInputStore.clear(PLATFORM);
    await connectInputStore.enqueue(PLATFORM, { type: "type", text: "AB12" });
    await connectInputStore.enqueue(PLATFORM, { type: "confirm" });
    const drained = await connectInputStore.drain(PLATFORM);
    await assert(drained.length === 2, `expected 2 actions, got ${drained.length}`);
    await assert(drained[0]?.type === "type", "first action type");
    await assert(
      drained[0]?.type === "type" && drained[0].text === "AB12",
      "type text mismatch",
    );
    await assert(drained[1]?.type === "confirm", "second action confirm");

    const empty = await connectInputStore.drain(PLATFORM);
    await assert(empty.length === 0, "queue should be empty after drain");

    await connectJobStore.markFailed(PLATFORM, "smoke cleanup");
    console.log("[ok] connect-input queue + interactive preserve smoke passed");
  });
}

main().catch((error) => {
  console.error("[fail]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
