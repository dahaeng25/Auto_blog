#!/usr/bin/env node
/**
 * 새 PC 초기 설정 자동화 스크립트
 *
 * 사용법:
 *   node setup.mjs              기본 설정 (npm install, Playwright, .env, 빌드 검사)
 *   node setup.mjs --with-tests 설치 후 단계별 테스트 실행
 *   node setup.mjs --with-auth  설치 후 네이버·티스토리 로그인 (수동)
 *   node setup.mjs --full       설치 + 테스트 + 로그인 안내까지
 *   node setup.mjs --help
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const NODE_MIN_MAJOR = 20;
const NODE_MAX_RECOMMENDED_MAJOR = 22;

const FLAGS = {
  skipInstall: process.argv.includes("--skip-install"),
  skipPlaywright: process.argv.includes("--skip-playwright"),
  skipBuild: process.argv.includes("--skip-build"),
  skipEnv: process.argv.includes("--skip-env"),
  withTests: process.argv.includes("--with-tests"),
  withAuth: process.argv.includes("--with-auth"),
  full: process.argv.includes("--full"),
  help: process.argv.includes("--help") || process.argv.includes("-h"),
  wizard: process.argv.includes("--wizard"),
};

if (FLAGS.full) {
  FLAGS.withTests = true;
  FLAGS.withAuth = true;
}

// ─── 유틸 ───────────────────────────────────────────────────────────────────

function log(step, message) {
  console.log(`\n[${step}] ${message}`);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function warn(message) {
  console.warn(`  ⚠ ${message}`);
}

function fail(message) {
  console.error(`  ✗ ${message}`);
}

function run(command, args, options = {}) {
  const { cwd = ROOT, label = `${command} ${args.join(" ")}` } = options;

  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: isWin,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} 실패 (exit ${code})`));
    });
  });
}

function npmCommand() {
  // Windows PowerShell은 npm → npm.ps1 로 연결되어 실행 정책에 막힐 수 있음
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function npm(args) {
  const cmd = npmCommand();
  return run(cmd, args, { label: `${cmd} ${args.join(" ")}` });
}

function ensureDir(relativePath) {
  const dir = path.join(ROOT, relativePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function printHelp() {
  console.log(`
Blog Orchestrator — 새 PC 설정 스크립트

사용법:
  node setup.mjs [옵션]

옵션:
  --skip-install     npm install 건너뛰기
  --skip-playwright  Playwright Chromium 설치 건너뛰기
  --skip-build       TypeScript 빌드 검사 건너뛰기
  --skip-env         .env 생성 건너뛰기
  --wizard           .env 생성 시 API 키 등 대화형 입력
  --with-tests       설치 후 thumbnail/content/publish 테스트
  --with-auth        설치 후 npm run auth:setup 실행 (브라우저 로그인 필요)
  --full             --with-tests --with-auth 와 동일
  -h, --help         도움말

npm 스크립트:
  npm run setup
  npm run setup:full
`);
}

// ─── 1. Node.js 버전 확인 ───────────────────────────────────────────────────

function checkNodeVersion() {
  log("1/6", "Node.js 버전 확인");

  const version = process.versions.node;
  const major = Number.parseInt(version.split(".")[0], 10);

  ok(`Node.js ${version}`);

  if (Number.isNaN(major) || major < NODE_MIN_MAJOR) {
    fail(`Node.js ${NODE_MIN_MAJOR} 이상이 필요합니다.`);
    fail("https://nodejs.org 에서 LTS(20 또는 22)를 설치하세요.");
    process.exit(1);
  }

  if (major > NODE_MAX_RECOMMENDED_MAJOR) {
    warn(
      `Node ${major} 은(는) better-sqlite3 빌드 오류가 날 수 있습니다.`,
    );
    warn("Node 20 또는 22 LTS 사용을 권장합니다.");
    warn("오류 시 Visual Studio C++ Build Tools 설치가 필요할 수 있습니다.");
  }
}

// ─── 2. npm install ─────────────────────────────────────────────────────────

async function installDependencies() {
  if (FLAGS.skipInstall) {
    warn("npm install 건너뜀 (--skip-install)");
    return;
  }

  log("2/6", "npm install 실행");
  await npm(["install"]);
  ok("의존성 설치 완료");
}

// ─── 3. Playwright Chromium ─────────────────────────────────────────────────

async function installPlaywright() {
  if (FLAGS.skipPlaywright) {
    warn("Playwright 설치 건너뜀 (--skip-playwright)");
    return;
  }

  log("3/6", "Playwright Chromium 설치");
  await run("npx", ["playwright", "install", "chromium"], {
    label: "playwright install chromium",
  });
  ok("Chromium 설치 완료");
}

// ─── 4. .env 파일 ───────────────────────────────────────────────────────────

async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(question, resolve);
  });
  rl.close();
  return answer.trim();
}

function setEnvValue(content, key, value) {
  if (!value) return content;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

async function setupEnvFile() {
  if (FLAGS.skipEnv) {
    warn(".env 설정 건너뜀 (--skip-env)");
    return;
  }

  log("4/6", ".env 파일 준비");

  const examplePath = path.join(ROOT, ".env.example");
  const envPath = path.join(ROOT, ".env");

  if (!fs.existsSync(examplePath)) {
    fail(".env.example 파일이 없습니다.");
    process.exit(1);
  }

  if (fs.existsSync(envPath)) {
    ok(".env 파일이 이미 존재합니다 — 덮어쓰지 않습니다.");
    return;
  }

  let content = fs.readFileSync(examplePath, "utf-8");
  fs.writeFileSync(envPath, content, "utf-8");
  ok(".env 파일 생성 (.env.example 복사)");

  if (FLAGS.wizard) {
    console.log("\n  .env 값을 입력하세요. 비우고 Enter를 누르면 기본값을 유지합니다.\n");

    const openaiKey = await ask("  OPENAI_API_KEY: ");
    const naverId = await ask("  NAVER_BLOG_ID: ");
    const tistoryName = await ask("  TISTORY_BLOG_NAME: ");
    const discordUrl = await ask("  DISCORD_WEBHOOK_URL (선택): ");

    content = setEnvValue(content, "OPENAI_API_KEY", openaiKey);
    content = setEnvValue(content, "NAVER_BLOG_ID", naverId);
    content = setEnvValue(content, "TISTORY_BLOG_NAME", tistoryName);
    content = setEnvValue(content, "DISCORD_WEBHOOK_URL", discordUrl);

    fs.writeFileSync(envPath, content, "utf-8");
    ok(".env 값 저장 완료");
  } else {
    warn(".env를 열어 OPENAI_API_KEY, NAVER_BLOG_ID, TISTORY_BLOG_NAME을 입력하세요.");
    warn("대화형 입력: node setup.mjs --wizard");
  }
}

// ─── 5. 디렉터리 + 빌드 검사 ───────────────────────────────────────────────

async function prepareDirsAndBuild() {
  log("5/6", "작업 디렉터리 및 빌드 검사");

  for (const dir of ["auth", "data", "output", "output/drafts", "output/thumbnails", "output/logs"]) {
    ensureDir(dir);
  }
  ok("auth/, data/, output/ 디렉터리 준비");

  if (FLAGS.skipBuild) {
    warn("빌드 검사 건너뜀 (--skip-build)");
    return;
  }

  await npm(["run", "build"]);
  ok("TypeScript 빌드 검사 통과");
}

// ─── 6. 선택 단계 (테스트 / 인증) ───────────────────────────────────────────

async function runOptionalSteps() {
  log("6/6", "선택 단계");

  if (!FLAGS.withTests && !FLAGS.withAuth) {
    printNextSteps();
    return;
  }

  if (FLAGS.withTests) {
    console.log("\n  ── 단계별 테스트 ──\n");

    try {
      await npm(["run", "thumbnail:test"]);
      ok("썸네일 테스트 통과");
    } catch (error) {
      fail(error.message);
      warn("썸네일 테스트 실패 — Playwright 설치를 확인하세요.");
    }

    const envPath = path.join(ROOT, ".env");
    const envContent = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf-8")
      : "";
    const hasOpenAi = /^OPENAI_API_KEY=\S+/m.test(envContent);

    if (hasOpenAi) {
      try {
        await npm(["run", "content:test"]);
        ok("콘텐츠 테스트 통과");
      } catch (error) {
        fail(error.message);
        warn("콘텐츠 테스트 실패 — OPENAI_API_KEY와 네트워크를 확인하세요.");
      }
    } else {
      warn("OPENAI_API_KEY 미설정 — content:test 건너뜀");
    }

    const hasAuth =
      fs.existsSync(path.join(ROOT, "auth", "naver_state.json")) &&
      fs.existsSync(path.join(ROOT, "auth", "tistory_state.json"));

    if (hasAuth) {
      try {
        await npm(["run", "publish:test"]);
        ok("발행 테스트 통과 (PUBLISH_DRY_RUN 설정에 따름)");
      } catch (error) {
        fail(error.message);
        warn("발행 테스트 실패 — auth:setup 및 블로그 ID를 확인하세요.");
      }
    } else {
      warn("세션 파일 없음 — publish:test 건너뜀 (npm run auth:setup 필요)");
    }
  }

  if (FLAGS.withAuth) {
    console.log("\n  ── 네이버·티스토리 로그인 ──\n");
    console.log("  브라우저에서 직접 로그인해야 합니다.\n");
    await npm(["run", "auth:setup"]);
    ok("인증 설정 완료");
  }

  printNextSteps();
}

function printNextSteps() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              설정 완료 — 다음 단계                        ║
╚══════════════════════════════════════════════════════════╝

  1. .env 파일 확인 (API 키, 블로그 ID)
     notepad .env

  2. 네이버·티스토리 로그인 (아직 안 했다면)
     npm run auth:setup

  3. 단계별 테스트
     npm run thumbnail:test
     npm run content:test
     npm run publish:test

  4. 전체 파이프라인 1회 실행
     npm run run:once

  5. 매일 자동 실행 (스케줄러)
     npm start

  ※ 처음엔 .env에서 PUBLISH_DRY_RUN=true 로 두고 테스트하세요.
`);
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  if (FLAGS.help) {
    printHelp();
    return;
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Blog Orchestrator — 새 PC 자동 설정                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  checkNodeVersion();
  await installDependencies();
  await installPlaywright();
  await setupEnvFile();
  await prepareDirsAndBuild();
  await runOptionalSteps();
}

main().catch((error) => {
  console.error("\n❌ 설정 중 오류:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
