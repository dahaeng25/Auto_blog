import type { Page } from "playwright";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";
import {
  pickTistoryCategory,
  type TistoryCategoryOption,
} from "./tistory-category.js";

const PLATFORM_NAME = "티스토리";

function getSearchContexts(page: Page, contexts: PageOrFrame[]): PageOrFrame[] {
  return [...new Set([page, ...contexts, ...page.frames()])];
}

/** 발행 패널·에디터에서 카테고리 목록 수집 */
async function collectCategoryOptions(page: Page): Promise<TistoryCategoryOption[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    const results: { id: string; name: string }[] = [];

    const add = (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      results.push({ id: id || trimmed, name: trimmed });
    };

    const selects = document.querySelectorAll(
      'select#category, select[name="category"], select[id*="category"]',
    );
    for (const select of Array.from(selects)) {
      for (const opt of Array.from((select as HTMLSelectElement).options)) {
        if (opt.value && opt.textContent?.trim()) {
          add(opt.value, opt.textContent.trim());
        }
      }
    }

    const listItems = document.querySelectorAll(
      "#category-list li, .category_list li, .list_category li, [class*='category'] li, .mce-menu-item",
    );
    for (const item of Array.from(listItems)) {
      const name = item.textContent?.trim();
      if (!name) continue;
      const id =
        item.getAttribute("data-category-id") ??
        item.getAttribute("data-id") ??
        item.getAttribute("value") ??
        name;
      add(id, name);
    }

    const radioLabels = document.querySelectorAll(
      'label[for*="category"], .category-item label, .item_category label',
    );
    for (const label of Array.from(radioLabels)) {
      const name = label.textContent?.trim();
      if (!name) continue;
      const htmlFor = (label as HTMLLabelElement).htmlFor;
      const input =
        label.querySelector("input") ??
        (htmlFor ? document.getElementById(htmlFor) : null);
      const id = input?.getAttribute("value") ?? name;
      add(id, name);
    }

    return results;
  });
}

/** 카테고리 드롭다운 열기 */
async function openCategoryDropdown(
  page: Page,
  contexts: PageOrFrame[],
): Promise<void> {
  const selectors = splitSelectors(EDITOR_SELECTORS.tistory.categoryButton);
  const btn = await findFirstVisible(getSearchContexts(page, contexts), selectors);

  if (btn) {
    await humanClick(btn.locator);
    await humanPause(800);
    return;
  }

  await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll("button, a, span, div"),
    ) as HTMLElement[];
    for (const el of candidates) {
      const text = el.textContent?.trim() ?? "";
      if (
        text.includes("카테고리") ||
        el.id.includes("category") ||
        el.className.includes("category")
      ) {
        el.click();
        return;
      }
    }
  });
  await humanPause(800);
}

async function applyCategorySelection(
  page: Page,
  category: TistoryCategoryOption,
): Promise<boolean> {
  const applied = await page.evaluate((cat) => {
    const selects = document.querySelectorAll(
      'select#category, select[name="category"], select[id*="category"]',
    );
    for (const select of Array.from(selects)) {
      const el = select as HTMLSelectElement;
      for (const opt of Array.from(el.options)) {
        if (opt.value === cat.id || opt.textContent?.trim() === cat.name) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return "select";
        }
      }
    }

    const clickables = Array.from(
      document.querySelectorAll(
        "#category-list li, .category_list li, .list_category li, [class*='category'] li, label, button, a",
      ),
    ) as HTMLElement[];

    for (const el of clickables) {
      const text = el.textContent?.trim() ?? "";
      if (text === cat.name || text.includes(cat.name)) {
        el.click();
        return "list";
      }
    }

    const inputs = document.querySelectorAll(
      'input[type="radio"][name*="category"]',
    );
    for (const input of Array.from(inputs)) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      const text = label?.textContent?.trim() ?? "";
      if (
        (input as HTMLInputElement).value === cat.id ||
        text === cat.name
      ) {
        (input as HTMLInputElement).click();
        return "radio";
      }
    }

    return null;
  }, category);

  if (applied) {
    await humanPause(500);
    return true;
  }

  return false;
}

/** 제목·키워드에 맞는 카테고리 자동 선택 */
export async function selectTistoryCategory(
  page: Page,
  contexts: PageOrFrame[],
  title: string,
  keywords: string,
): Promise<void> {
  let options = await collectCategoryOptions(page);

  if (options.length === 0) {
    await openCategoryDropdown(page, contexts);
    options = await collectCategoryOptions(page);
  }

  if (options.length === 0) {
    console.log(`[${PLATFORM_NAME}] 카테고리 목록 미발견 — 기본값으로 진행`);
    return;
  }

  const picked = pickTistoryCategory(options, title, keywords);
  if (!picked) {
    console.log(`[${PLATFORM_NAME}] 매칭 카테고리 없음 — 첫 항목 사용`);
    return;
  }

  if (options.length > 1) {
    await openCategoryDropdown(page, contexts);
  }

  const ok = await applyCategorySelection(page, picked);
  if (ok) {
    console.log(`[${PLATFORM_NAME}] ② 카테고리 선택: ${picked.name}`);
    return;
  }

  console.warn(
    `[${PLATFORM_NAME}] 카테고리 '${picked.name}' 선택 실패 — 발행 계속`,
  );
}
