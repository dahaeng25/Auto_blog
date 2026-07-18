import "dotenv/config";
import fs from "node:fs";
import { config } from "../config/index.js";
import { PLATFORMS } from "../config/platforms.js";
import {
  createBrowserSession,
  getSessionPage,
} from "../src/auth/browser-factory.js";
import { fillLoginField } from "../src/auth/auth-wait.js";

const headless = process.argv.includes("--headless");

async function main() {
  console.log("launch headless=", headless);
  const session = await createBrowserSession({ headless });
  const page = await getSessionPage(session);
  try {
    console.log("goto…");
    await page.goto(PLATFORMS.naver.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2000);
    console.log("url1", page.url());

    if (!config.naverId || !config.naverPassword) {
      throw new Error("NAVER_ID/PASSWORD missing");
    }

    console.log("fill id…");
    await fillLoginField(page, "#id", config.naverId);
    console.log("fill pw…");
    await fillLoginField(page, "#pw", config.naverPassword);
    await page.waitForTimeout(1000);
    console.log("url2", page.url());

    const html = await page.content();
    fs.writeFileSync("tmp-naver-login.html", html);
    await page.screenshot({
      path: "tmp-naver-login.jpg",
      type: "jpeg",
      quality: 60,
    });

    const candidates = [
      '#log\\.login',
      "button.btn_login",
      "input.btn_global",
      'button[type="submit"]',
      ".btn_login",
      "#submit_btn",
      "form button",
      "form input[type=submit]",
      "#login_keep",
      "#id",
      "#pw",
    ];
    for (const sel of candidates) {
      const n = await page.locator(sel).count();
      const vis =
        n > 0
          ? await page
              .locator(sel)
              .first()
              .isVisible()
              .catch(() => false)
          : false;
      console.log(`${sel} count=${n} visible=${vis}`);
    }

    const body = (await page.locator("body").innerText())
      .replace(/\s+/g, " ")
      .slice(0, 600);
    console.log("body:", body);
  } finally {
    await session.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
