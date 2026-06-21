import type { Frame, Page } from "playwright";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { splitSelectors } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";

/**
 * 업로드 직후 마지막 이미지에 대체 텍스트(alt)를 설정합니다.
 * UI가 없으면 경고만 남기고 계속 진행합니다.
 */
export async function setNaverImageAltText(
  page: Page,
  frame: Frame,
  altText: string,
  platformName = "네이버",
): Promise<void> {
  const images = frame.locator(".se-component.se-image");
  const count = await images.count();
  if (count === 0) return;

  const lastImage = images.nth(count - 1);
  await humanClick(lastImage);
  await humanPause(500);

  const contexts = [frame, page, ...page.frames()];
  const altSelectors = splitSelectors(EDITOR_SELECTORS.naver.imageAltInput);

  for (const ctx of contexts) {
    for (const sel of altSelectors) {
      const input = ctx.locator(sel).first();
      try {
        if ((await input.count()) === 0 || !(await input.isVisible())) continue;
        await input.fill(altText);
        await humanPause(300);

        const confirmSelectors = splitSelectors(
          EDITOR_SELECTORS.naver.imageAltConfirm,
        );
        for (const cSel of confirmSelectors) {
          const btn = ctx.locator(cSel).first();
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            await humanClick(btn);
            await humanPause(400);
            console.log(`[${platformName}] 이미지 대체 텍스트 설정 완료`);
            return;
          }
        }

        await page.keyboard.press("Escape");
        console.log(`[${platformName}] 이미지 대체 텍스트 입력 (확인 버튼 없음)`);
        return;
      } catch {
        // 다음 셀렉터
      }
    }
  }

  console.warn(`[${platformName}] 이미지 대체 텍스트 UI 미발견 — 파일명 메타만 적용`);
}
