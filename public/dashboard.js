const PLATFORM_LABELS = {
  naver: "네이버",
  tistory: "티스토리",
  google: "Google",
};

/** 대시보드 세션 관리 대상 (Google 세션 UI 제외) */
const DASHBOARD_PLATFORMS = ["naver", "tistory"];

const STEP_LABELS = ["수집", "생성", "썸네일", "발행"];
const STEP_KEYS = ["collect", "content", "thumbnail", "publish"];
let pollTimer = null;
let lastLogs = [];
let lastStatus = null;
let currentUser = null;
let authMode = "login";
let envLoginAvailable = { naver: false, tistory: false };
let connectFeatures = { headedManualLogin: false, loginPreview: false };
let activeConnectRequest = { platform: null, username: "", password: "" };
const CONNECT_FALLBACK_MS = 45_000;

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    showAuthScreen();
    throw { message: "로그인이 필요합니다.", stage: "인증", hint: "다시 로그인해 주세요." };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      /* HTML/빈 본문 등 */
    }
    const error =
      body.error ??
      body.message ??
      (typeof text === "string" && text.trim()
        ? text.trim().slice(0, 300)
        : `요청 실패 (${res.status})`);
    const detail = body.detail ? String(body.detail) : "";
    const stage =
      body.stage ??
      (isInfraErrorText(error) ? "연결" : inferStageFromText(error));
    const hint =
      body.hint ??
      (detail && detail !== error
        ? detail.slice(0, 240)
        : isInfraErrorText(error)
          ? "Vercel 환경 변수·배포·로그인을 확인한 뒤 새로고침하세요."
          : "실행 로그를 확인한 뒤, 해당 단계 버튼부터 다시 실행해 주세요.");
    throw { message: error, stage, hint, detail };
  }
  return res.json();
}

function isInfraErrorText(text = "") {
  const t = String(text);
  return (
    /데이터베이스 연결|TURSO_|프록시 오류|서버 프록시|상태 조회 실패|세션 저장 실패/i.test(
      t,
    ) ||
    /로그인이 필요/i.test(t) ||
    /FUNCTION_INVOCATION_TIMEOUT|An error occurred with your deployment/i.test(t)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDesktopClient() {
  return (
    window.matchMedia("(min-width: 768px)").matches &&
    !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}

function getConnectUiScope() {
  const screen = document.getElementById("platform-login-screen");
  return screen && !screen.classList.contains("hidden") ? "modal" : "page";
}

function connectProgressIds(scope) {
  if (scope === "modal") {
    return {
      wrap: "platform-login-progress-wrap",
      current: "platform-login-progress-current",
      log: "platform-login-progress-log",
      screenshot: "platform-login-screenshot",
      fallback: "platform-login-fallback",
      manualBtn: "platform-login-manual-btn",
      previewBtn: "platform-login-preview-btn",
      retryBtn: "platform-login-retry-btn",
    };
  }
  return {
    wrap: "connect-progress-wrap",
    current: "connect-progress-current",
    log: "connect-progress-log",
    screenshot: "connect-progress-screenshot",
    fallback: "connect-fallback-panel",
    manualBtn: "connect-manual-btn",
    previewBtn: "connect-preview-btn",
    retryBtn: "connect-retry-btn",
  };
}

function resetConnectProgressUI(scope = getConnectUiScope()) {
  const ids = connectProgressIds(scope);
  document.getElementById(ids.wrap)?.classList.add("hidden");
  document.getElementById(ids.fallback)?.classList.add("hidden");
  const logEl = document.getElementById(ids.log);
  if (logEl) logEl.innerHTML = "";
  const currentEl = document.getElementById(ids.current);
  if (currentEl) currentEl.textContent = "";
  const shot = document.getElementById(ids.screenshot);
  if (shot) {
    shot.classList.add("hidden");
    shot.removeAttribute("src");
  }
}

function updateConnectFallbackButtons(scope, features = connectFeatures) {
  const ids = connectProgressIds(scope);
  const manualBtn = document.getElementById(ids.manualBtn);
  const previewBtn = document.getElementById(ids.previewBtn);
  if (manualBtn) {
    manualBtn.classList.toggle("hidden", !features.headedManualLogin);
  }
  if (previewBtn) {
    previewBtn.classList.toggle("hidden", !features.loginPreview);
  }
}

function showConnectFallback(scope = getConnectUiScope(), visible = true) {
  const ids = connectProgressIds(scope);
  const panel = document.getElementById(ids.fallback);
  if (!panel) return;
  if (visible) {
    panel.classList.remove("hidden");
    updateConnectFallbackButtons(scope);
  } else {
    panel.classList.add("hidden");
  }
}

function renderConnectProgress(job, scope = getConnectUiScope()) {
  if (!job) return;
  const ids = connectProgressIds(scope);
  const wrap = document.getElementById(ids.wrap);
  const currentEl = document.getElementById(ids.current);
  const logEl = document.getElementById(ids.log);
  const shot = document.getElementById(ids.screenshot);
  if (!wrap || !currentEl || !logEl) return;

  wrap.classList.remove("hidden");

  const current = job.currentStep || (job.status === "connecting" ? "연결 중…" : "");
  currentEl.textContent = current;

  const logs = Array.isArray(job.stepLogs) ? job.stepLogs : [];
  logEl.innerHTML = logs
    .map((entry) => {
      const time = entry.at
        ? new Date(entry.at).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "";
      const timeHtml = time
        ? `<span class="connect-log-time">${escapeHtml(time)}</span> `
        : "";
      return `<li>${timeHtml}${escapeHtml(entry.message)}</li>`;
    })
    .join("");
  logEl.scrollTop = logEl.scrollHeight;

  if (shot && job.screenshotBase64) {
    shot.src = `data:image/jpeg;base64,${job.screenshotBase64}`;
    shot.classList.remove("hidden");
  }
}

/** 계정 연결 비동기 작업이 끝날 때까지 /api/status 폴링 */
async function pollConnectJob(
  platform,
  { timeoutMs = 310_000, intervalMs = 2000, scope = getConnectUiScope() } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const fallbackAt = Date.now() + CONNECT_FALLBACK_MS;
  let lastError = null;
  let fallbackShown = false;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const data = await api("/api/status");
      lastStatus = data;
      if (data.config?.connectFeatures) {
        connectFeatures = {
          headedManualLogin: Boolean(data.config.connectFeatures.headedManualLogin),
          loginPreview: Boolean(data.config.connectFeatures.loginPreview),
        };
      }
      updateConnectPanelStatus(data.sessionDetails, data.connectJobs);
      const job = data.connectJobs?.[platform];
      if (!job) continue;

      renderConnectProgress(job, scope);

      if (
        !fallbackShown &&
        isDesktopClient() &&
        job.status === "connecting" &&
        Date.now() >= fallbackAt
      ) {
        fallbackShown = true;
        showConnectFallback(scope, true);
      }

      if (job.status === "connected") {
        showConnectFallback(scope, false);
        return { ok: true, job, data };
      }
      if (job.status === "failed") {
        showConnectFallback(scope, true);
        throw {
          message: job.lastError || "연결에 실패했습니다.",
          stage: "계정 연결",
          hint: "아이디·비밀번호를 확인한 뒤 다시 연결해 주세요.",
        };
      }
    } catch (err) {
      if (err && typeof err === "object" && err.stage === "계정 연결") throw err;
      lastError = err;
    }
  }

  showConnectFallback(scope, true);
  throw {
    message:
      lastError?.message ||
      "연결 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    stage: "계정 연결",
    timedOut: true,
    hint: "추가 인증(캡차·2단계)이 있거나 서버 시간이 부족할 수 있습니다.",
  };
}

async function connectPlatform(
  platform,
  { username = "", password = "", manual = false } = {},
) {
  const label = PLATFORM_LABELS[platform] ?? platform;
  const scope = getConnectUiScope();
  const msgEl = document.getElementById("connect-message");
  const statusEl = document.getElementById("platform-login-status");
  const submit = document.getElementById("platform-login-submit");
  const envBtn = document.getElementById("platform-login-env-btn");

  activeConnectRequest = { platform, username, password };

  const setBusy = (busy) => {
    if (submit) {
      submit.disabled = busy;
      submit.textContent = busy
        ? manual
          ? "직접 로그인 준비 중…"
          : "연결 중…"
        : "로그인하고 연결";
    }
    if (envBtn) envBtn.disabled = busy;
    document.querySelectorAll(".btn-connect").forEach((btn) => {
      btn.disabled = busy;
    });
  };

  resetConnectProgressUI(scope);
  showConnectFallback(scope, false);
  setBusy(true);
  if (msgEl) {
    msgEl.style.color = "var(--text-muted)";
    msgEl.textContent = manual
      ? `${label} 직접 로그인을 준비하는 중…`
      : `${label} 연결 중… 잠시만 기다려 주세요.`;
  }
  if (statusEl) {
    statusEl.className = "platform-login-status";
    statusEl.textContent = manual
      ? connectFeatures.headedManualLogin
        ? "브라우저 창이 열리면 직접 로그인해 주세요."
        : "로그인 화면을 준비하는 중입니다."
      : "로그인 중입니다. 아래 진행 로그를 확인해 주세요.";
  }
  clearErrorCard();

  try {
    const body = { force: true, phase: "start", manual: manual || undefined };
    if (username && password) {
      body.username = username;
      body.password = password;
    }

    const start = await api(`/api/sessions/${platform}/refresh`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (start?.connectJob) {
      renderConnectProgress(start.connectJob, scope);
    }

    if (start?.needsClientRun) {
      void fetch(`/api/sessions/${platform}/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, phase: "run" }),
      }).catch(() => {});
    }

    if (start?.status !== "connected") {
      await pollConnectJob(platform, { scope });
    }

    if (statusEl) {
      statusEl.className = "platform-login-status success";
      statusEl.textContent = "연결되었습니다.";
    }
    if (msgEl) {
      msgEl.style.color = "var(--success)";
      msgEl.textContent = `${label} 연결 완료`;
    }
    resetConnectProgressUI(scope);
    await refreshAll();
    closePlatformLogin();
  } catch (err) {
    const error = normalizeError(err);
    let hint = error.hint;
    if (/2단계|캡차|CAPTCHA|추가 인증|보안문자/.test(error.message)) {
      hint =
        hint ??
        "추가 인증이 필요할 수 있습니다. 「브라우저에서 직접 로그인」 또는 잠시 후 다시 시도해 주세요.";
    }
    if (/404|실패 \(404\)/.test(error.message)) {
      hint =
        hint ??
        "배포가 최신이 아닐 수 있습니다. 재배포 후 다시 시도해 주세요.";
    }
    if (/FUNCTION_INVOCATION_TIMEOUT|An error occurred with your deployment/i.test(error.message)) {
      hint = "서버 처리 시간이 초과되었습니다. 아래 버튼으로 다시 시도해 주세요.";
      error.message = "연결 시간이 초과되었습니다. 다시 시도해 주세요.";
    }
    if (statusEl) {
      statusEl.className = "platform-login-status error";
      statusEl.textContent = error.message;
    }
    if (msgEl) {
      msgEl.style.color = "var(--error)";
      msgEl.textContent = error.message;
    }
    showConnectFallback(scope, true);
    showErrorCard(
      error.message,
      "계정 연결",
      hint ?? "아이디·비밀번호를 확인한 뒤 다시 연결해 주세요.",
    );
    await refreshAll();
  } finally {
    setBusy(false);
  }
}

function handleConnectRetry() {
  const { platform, username, password } = activeConnectRequest;
  if (!platform) return;
  void connectPlatform(platform, { username, password, manual: false });
}

function handleConnectManual() {
  const { platform, username, password } = activeConnectRequest;
  if (!platform) return;
  void connectPlatform(platform, { username, password, manual: true });
}

function renderSessionDetails(sessionDetails, enabledPlatforms) {
  const platforms =
    enabledPlatforms?.length > 0
      ? enabledPlatforms.filter((p) => DASHBOARD_PLATFORMS.includes(p))
      : DASHBOARD_PLATFORMS;

  return platforms
    .map((p) => {
      const label = PLATFORM_LABELS[p] ?? p;
      const info = sessionDetails?.[p];

      const hasSession = Boolean(info?.hasSession);
      const valid = info?.valid ?? (hasSession ? "unknown" : "expired");
      const check = valid === "ok" ? "✓" : "✗";
      const badgeClass = valid === "ok" ? "success" : valid === "expired" ? "error" : "idle";

      const accountId = info?.accountId ?? "—";
      const blogId = info?.blogId ?? "—";

      const statusText =
        valid === "ok"
          ? "연결됨"
          : valid === "expired"
            ? "다시 연결 필요"
            : hasSession
              ? "연결됨"
              : "연결 안 됨";
      const verification =
        info?.verifiedAt
          ? info?.verifiedValid
            ? " (확인됨)"
            : " (확인 실패)"
          : "";

      const loginSource =
        info?.accountIdSource === "env"
          ? " (설정 기준)"
          : "";

      const blogSource =
        info?.blogIdSource === "env" ? " (설정 기준)" : "";

      const title = info?.message ? escapeHtml(info.message) : "";

      return `
        <div class="session-row" data-platform="${escapeHtml(p)}" ${title ? `title="${title}"` : ""}>
          <div class="session-row-top">
            <span class="session-platform">${escapeHtml(label)}</span>
            <span class="badge ${badgeClass} session-platform-check">${escapeHtml(check)}</span>
          </div>
          <div class="session-row-line">로그인 ID: ${escapeHtml(accountId)}${escapeHtml(loginSource)}</div>
          <div class="session-row-line">블로그: ${escapeHtml(blogId)}${escapeHtml(blogSource)}</div>
          <div class="session-row-line session-row-status">상태: ${escapeHtml(statusText)}${escapeHtml(verification)}</div>
        </div>
      `;
    })
    .join("");
}

function updateConnectPanelStatus(sessionDetails, connectJobs) {
  for (const p of DASHBOARD_PLATFORMS) {
    const badge = document.getElementById(`connect-status-${p}`);
    const hint = document.getElementById(`connect-hint-${p}`);
    const btn = document.querySelector(`.btn-connect[data-platform="${p}"]`);
    if (!badge) continue;

    const connectJob = connectJobs?.[p];
    if (connectJob?.status === "connecting") {
      badge.className = "badge connect-status idle";
      badge.textContent = "연결 중…";
      const step = connectJob.currentStep;
      if (hint) {
        hint.textContent = step || "로그인 진행 중입니다. 잠시만 기다려 주세요.";
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "연결 중…";
      }
      continue;
    }

    const info = sessionDetails?.[p];
    const hasSession = Boolean(info?.hasSession);
    const valid = info?.valid ?? (hasSession ? "unknown" : "expired");

    badge.className = `badge connect-status ${
      valid === "ok" ? "success" : valid === "expired" ? "error" : "idle"
    }`;

    if (!hasSession) {
      badge.textContent = "연결 안 됨";
      if (hint) {
        hint.textContent =
          connectJob?.status === "failed" && connectJob.lastError
            ? connectJob.lastError
            : "아직 연결되지 않았습니다.";
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = `${PLATFORM_LABELS[p] ?? p} 연결`;
      }
      continue;
    }

    if (valid === "ok") {
      badge.textContent = "연결됨";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "다시 연결";
      }
    } else if (valid === "expired") {
      badge.textContent = "다시 연결 필요";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "다시 연결";
      }
    } else {
      badge.textContent = "연결됨";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "다시 연결";
      }
    }

    if (hint) {
      const parts = [];
      if (info?.accountId && info.accountId !== "—") {
        parts.push(`계정: ${info.accountId}`);
      }
      if (info?.blogId && info.blogId !== "—") {
        parts.push(`블로그: ${info.blogId}`);
      }
      hint.textContent =
        parts.length > 0 ? parts.join(" · ") : "연결이 저장되어 있습니다.";
    }
  }
}


function statusBadgeClass(status) {
  return `badge ${status ?? "idle"}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR");
}

function inferStageFromText(text = "") {
  const t = String(text).toLowerCase();
  if (t.includes("rss") || t.includes("수집")) return "수집";
  if (
    t.includes("thumbnail") ||
    t.includes("썸네일") ||
    t.includes("browsertype.launch") ||
    t.includes("browsercontext.newpage") ||
    t.includes("libnss3") ||
    t.includes("libnspr4") ||
    t.includes("/tmp/chromium") ||
    t.includes("target page, context or browser has been closed")
  ) {
    return "썸네일";
  }
  if (
    t.includes("publish") ||
    t.includes("퍼블리싱") ||
    t.includes("업로드") ||
    t.includes("자동 로그인") ||
    t.includes("세션") ||
    t.includes("네이버") ||
    t.includes("티스토리") ||
    t.includes("blogger") ||
    t.includes("발행")
  ) {
    return "발행";
  }
  if (
    t.includes("gems") ||
    t.includes("생성") ||
    t.includes("title") ||
    t.includes("content")
  ) {
    return "생성";
  }
  return "생성";
}

function isPlaceholderLogLine(line = "") {
  const t = String(line);
  return (
    t.includes("아직 실행 로그가 없습니다") ||
    t.includes("상세 로그: Vercel") ||
    t.includes("Deployments → Functions")
  );
}

function usableLogs(logs = []) {
  return logs.filter((line) => line && !isPlaceholderLogLine(line));
}

/** trigger 예: web-step:content, web-step:publish, web, cron */
function stageFromTrigger(trigger = "") {
  const t = String(trigger).toLowerCase();
  if (t.includes("collect")) return "수집";
  if (t.includes("thumbnail")) return "썸네일";
  if (t.includes("publish")) return "발행";
  if (t.includes("content")) return "생성";
  return null;
}

function inferCurrentStage(job, logs) {
  if (job?.status === "success") return "done";
  if (job?.status === "error") {
    return (
      stageFromTrigger(job.trigger) ??
      inferStageFromText(job.lastError) ??
      "생성"
    );
  }
  if (job?.status !== "running") return "idle";

  const fromTrigger = stageFromTrigger(job.trigger);
  const realLogs = usableLogs(logs);
  if (realLogs.length === 0) {
    return fromTrigger ?? "생성";
  }
  return inferStageFromText(realLogs.slice().reverse().join("\n"));
}

/** 로그 한 줄에서 타임스탬프·레벨 제거 */
function stripLogPrefix(line) {
  return String(line)
    .replace(/^\[[^\]]+\]\s*\[(?:INFO|WARN|ERROR)\]\s*/i, "")
    .trim();
}

/** 로그를 사용자 친화 한국어 설명으로 변환 */
function humanizeLogLine(rawLine) {
  const msg = stripLogPrefix(rawLine);
  if (!msg) return "";

  const rules = [
    [/오케스트레이션 시작|파이프라인.*시작/i, "전체 파이프라인을 시작했습니다"],
    [/phase\s*2|콘텐츠 생성|\[gems\]|\[content\]/i, "AI로 블로그 원고를 작성하는 중…"],
    [/phase\s*3|썸네일|thumbnail|\[thumbnail\]/i, "썸네일 이미지를 생성하는 중…"],
    [/phase\s*4|퍼블리싱|publish|\[publish\]/i, "블로그에 업로드하는 중…"],
    [/rss|수집/i, "RSS에서 주제를 수집하는 중…"],
    [/글쓰기 페이지|write.*page|에디터/i, "에디터 페이지에 접속하는 중…"],
    [/세션 워밍업|저장된 세션|기존 세션/i, "로그인 세션을 확인하는 중…"],
    [/자동 로그인|재로그인/i, "계정으로 자동 로그인을 시도하는 중…"],
    [/\[네이버\]|네이버.*발행/i, "네이버 블로그에 글을 올리는 중…"],
    [/\[티스토리\]|티스토리.*발행/i, "티스토리에 글을 올리는 중…"],
    [/카테고리/i, "티스토리 카테고리를 선택하는 중…"],
    [/공개 발행|발행 버튼/i, "발행 버튼을 누르는 중…"],
    [/이미지|upload|업로드/i, "본문·이미지를 에디터에 넣는 중…"],
    [/완료|success|✅/i, "단계가 완료되었습니다"],
    [/실패|error|퍼블리싱 실패/i, "오류가 발생했습니다"],
  ];

  for (const [pattern, text] of rules) {
    if (pattern.test(msg)) return text;
  }

  if (msg.length > 72) return `${msg.slice(0, 70)}…`;
  return msg;
}

/** 최근 로그에서 의미 있는 설명만 추출 (중복 제거) */
function extractActivityLines(logs, max = 5) {
  const seen = new Set();
  const result = [];

  for (let i = logs.length - 1; i >= 0 && result.length < max; i--) {
    const friendly = humanizeLogLine(logs[i]);
    if (!friendly || seen.has(friendly)) continue;
    seen.add(friendly);
    result.unshift(friendly);
  }

  return result;
}

function activitySummaryText(job, stage, lines, isRunning) {
  if (isRunning || job?.status === "running") {
    const latest = lines[lines.length - 1];
    if (latest) return `실행 중 — ${latest}`;
    if (stage !== "idle" && stage !== "done") {
      return `실행 중 — [${stage}] 단계를 처리하고 있습니다.`;
    }
    return "실행 중 — 작업을 처리하고 있습니다…";
  }
  if (job?.status === "success") {
    return job.lastTitle
      ? `완료 — 「${job.lastTitle}」 처리가 끝났습니다.`
      : "완료 — 모든 단계가 성공적으로 끝났습니다.";
  }
  if (job?.status === "error") {
    return "실패 — 아래 로그와 실패 요약을 확인해 주세요.";
  }
  return "대기 중 — 실행을 시작하면 여기에 진행 상황이 표시됩니다.";
}

function renderActivityBox(job, logs, statusConfig = {}) {
  const box = document.getElementById("activity-box");
  const summaryEl = document.getElementById("activity-summary");
  const pulseEl = document.getElementById("activity-pulse");
  const miniEl = document.getElementById("activity-mini-steps");
  const feedEl = document.getElementById("activity-feed");
  if (!box || !summaryEl || !pulseEl || !miniEl || !feedEl) return;

  const isRunning = Boolean(statusConfig.isRunning) || job?.status === "running";
  const contentMode = statusConfig.contentMode ?? "gems";
  const stage = inferCurrentStage(job, logs);
  const stageIndex = STEP_LABELS.indexOf(stage);
  const lines = extractActivityLines(usableLogs(logs), 5);

  summaryEl.textContent = activitySummaryText(job, stage, lines, isRunning);

  pulseEl.className = "activity-pulse";
  if (isRunning) pulseEl.classList.add("running");
  else if (job?.status === "success") pulseEl.classList.add("done");
  else if (job?.status === "error") pulseEl.classList.add("error");
  else pulseEl.classList.add("idle");

  miniEl.innerHTML = STEP_LABELS.map((label, i) => {
    const stepKey = STEP_KEYS[i];
    let segClass = "";
    if (contentMode === "gems" && stepKey === "collect") {
      segClass = "";
    } else if (job?.status === "success" || (stageIndex >= 0 && i < stageIndex)) {
      segClass = "done";
    } else if (job?.status === "error" && i === stageIndex) {
      segClass = "error";
    } else if (isRunning && i === stageIndex) {
      segClass = "running";
    }
    return `<span class="activity-mini-seg ${segClass}" title="${label}"></span>`;
  }).join("");

  if (!isRunning && (!job?.status || job.status === "idle")) {
    feedEl.innerHTML = `<li>${escapeHtml("아직 활동 기록이 없습니다.")}</li>`;
  } else if (lines.length === 0) {
    feedEl.innerHTML = `<li>${escapeHtml(
      isRunning
        ? "상세 로그는 Vercel Functions Logs에서 확인할 수 있습니다."
        : "아직 활동 기록이 없습니다.",
    )}</li>`;
  } else {
    feedEl.innerHTML = lines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
  }
}

function renderLogsSummary(logs, job) {
  const el = document.getElementById("logs-summary");
  if (!el) return;

  const lines = extractActivityLines(usableLogs(logs), 8);
  if (lines.length === 0 || job?.status === "idle" || !job?.status) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = lines
    .map((line) => `<span class="log-hint-line">${escapeHtml(line)}</span>`)
    .join("");
}

function renderProgress(job, logs, statusConfig = {}) {
  const container = document.getElementById("pipeline-progress");
  const stage = inferCurrentStage(job, logs);
  const stageIndex = STEP_LABELS.indexOf(stage);
  const isRunning = Boolean(statusConfig.isRunning) || job?.status === "running";
  const contentMode = statusConfig.contentMode ?? "gems";
  const effectiveStatus = isRunning
    ? "running"
    : job?.status === "success"
      ? "success"
      : job?.status === "error"
        ? "error"
        : "idle";

  container.innerHTML = STEP_LABELS.map((label, i) => {
    let stateClass = "waiting";
    let stateText = "대기";

    const stepKey = STEP_KEYS[i];
    const isCollectNa = stepKey === "collect" && contentMode === "gems";

    if (isCollectNa) {
      stateClass = "waiting";
      stateText = "해당없음";
    } else if (effectiveStatus === "success" || (stageIndex >= 0 && i < stageIndex && effectiveStatus !== "idle")) {
      stateClass = "done";
      stateText = "완료";
    } else if (effectiveStatus === "error" && i === stageIndex) {
      stateClass = "error";
      stateText = "실패";
    } else if (effectiveStatus === "running" && i === stageIndex) {
      stateClass = "running";
      stateText = "진행중";
    }

    const btnDisabled = isRunning || isCollectNa;
    const btnTitle = isCollectNa
      ? "gems 모드에서는 RSS 수집이 필요하지 않습니다"
      : `${label} 단계만 실행`;

    return `
      <div class="progress-step ${stateClass}">
        <span class="step-index">Step ${i + 1}</span>
        <span class="step-label">${label}</span>
        <span class="step-state">${stateText}</span>
        <button
          type="button"
          class="btn btn-ghost btn-sm step-run-btn"
          data-step="${stepKey}"
          ${btnDisabled ? "disabled" : ""}
          title="${escapeHtml(btnTitle)}"
        >실행</button>
      </div>
    `;
  }).join("");
}

function showErrorCard(errorText, stage, hint) {
  const card = document.getElementById("error-card");
  const body = document.getElementById("error-card-body");
  const stageLabel = stage === "연결" || stage === "인증" || stage === "세션"
    ? stage
    : `${stage} 단계`;
  const summary =
    stage === "연결" || stage === "인증" || stage === "세션"
      ? `[${stageLabel}]에서 문제가 발생했습니다.`
      : `[${stageLabel}]에서 실패했습니다.`;
  body.innerHTML = `
    <p class="error-summary">${escapeHtml(summary)}</p>
    <p>${escapeHtml(errorText)}</p>
    <p class="error-hint">${escapeHtml(hint)}</p>
  `;
  card.classList.remove("hidden");
}

function clearErrorCard() {
  const card = document.getElementById("error-card");
  const body = document.getElementById("error-card-body");
  if (body) body.innerHTML = "";
  card.classList.add("hidden");
}

function rememberInput(keyword, region) {
  const raw = localStorage.getItem("blog-history-v1");
  const prev = raw ? JSON.parse(raw) : { keywords: [], regions: [] };
  if (keyword) {
    prev.keywords = [keyword, ...prev.keywords.filter((k) => k !== keyword)].slice(
      0,
      10,
    );
  }
  if (region) {
    prev.regions = [region, ...prev.regions.filter((r) => r !== region)].slice(0, 10);
  }
  localStorage.setItem("blog-history-v1", JSON.stringify(prev));
  return prev;
}

function renderDatalist(id, items) {
  const el = document.getElementById(id);
  el.innerHTML = items.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
}

async function loadInputHistory() {
  const server = await api("/api/input-history");
  const local = JSON.parse(localStorage.getItem("blog-history-v1") ?? "{\"keywords\":[],\"regions\":[]}");
  const keywords = [...new Set([...(server.keywords ?? []), ...(local.keywords ?? [])])];
  const regions = [...new Set([...(server.regions ?? []), ...(local.regions ?? [])])];
  renderDatalist("keyword-history", keywords);
  renderDatalist("region-history", regions);
}

async function loadStatus(options = {}) {
  const suppressErrorCard = Boolean(options.suppressErrorCard);
  const data = await api("/api/status");
  const job = data.job;
  lastStatus = data;

  const statusEl = document.getElementById("job-status");
  statusEl.textContent =
    job.status === "running"
      ? "실행 중"
      : job.status === "success"
        ? "완료"
        : job.status === "error"
          ? "오류"
          : "대기";
  statusEl.className = statusBadgeClass(job.status);

  const detail = [];
  if (job.lastTitle) detail.push(`최근: ${job.lastTitle}`);
  if (job.startedAt) detail.push(`시작: ${formatDate(job.startedAt)}`);
  if (job.finishedAt) detail.push(`종료: ${formatDate(job.finishedAt)}`);
  if (job.status === "error" && job.lastError) {
    detail.push(`오류: ${job.lastError}`);
  }
  document.getElementById("job-detail").textContent =
    detail.join(" · ") || "아직 실행 이력이 없습니다.";

  document.getElementById("cron-schedule").textContent = data.config.cronSchedule;
  document.getElementById("cron-timezone").textContent = data.config.cronTimezone;
  document.getElementById("dry-run").textContent = data.config.publishDryRun
    ? "테스트 (발행 안 함)"
    : "실제 발행";
  document.getElementById("dry-run-meta").textContent = data.config.publishDryRun
    ? "DRY-RUN"
    : "LIVE";

  const topicInput = document.getElementById("blog-topic");
  if (topicInput && data.config.blogTopic && !topicInput.value) {
    topicInput.placeholder = `기본값: ${data.config.blogTopic}`;
  }

  const sessionEl = document.getElementById("session-status");
  if (sessionEl) {
    const details = data.sessionDetails;
    if (details) {
      sessionEl.innerHTML = renderSessionDetails(
        details,
        data.config.enabledPlatforms,
      );
    } else {
      sessionEl.textContent = "—";
    }
  }
  updateConnectPanelStatus(data.sessionDetails, data.connectJobs);
  if (data.config?.envLoginAvailable) {
    envLoginAvailable = {
      naver: Boolean(data.config.envLoginAvailable.naver),
      tistory: Boolean(data.config.envLoginAvailable.tistory),
    };
  }
  if (data.config?.connectFeatures) {
    connectFeatures = {
      headedManualLogin: Boolean(data.config.connectFeatures.headedManualLogin),
      loginPreview: Boolean(data.config.connectFeatures.loginPreview),
    };
  }
  document.getElementById("run-btn").disabled = data.isRunning;

  renderProgress(job, lastLogs, {
    isRunning: data.isRunning,
    contentMode: data.config.contentMode,
  });
  renderActivityBox(job, lastLogs, {
    isRunning: data.isRunning,
    contentMode: data.config.contentMode,
  });

  // 실패 요약은 현재 job이 error일 때만 표시. running/success/idle에서는 숨김
  if (!suppressErrorCard && job.status === "error") {
    showErrorCard(
      job.lastError ?? "실행 중 오류가 발생했습니다.",
      inferCurrentStage(job, lastLogs),
      "실행 로그와 해당 단계를 확인해 주세요.",
    );
  } else {
    clearErrorCard();
  }

  return data;
}

async function loadArticles() {
  const container = document.getElementById("articles-list");
  if (!container) return;

  try {
    const articles = await api("/api/articles?limit=10");

    if (!articles.length) {
      container.innerHTML = '<p class="empty">원고가 없습니다.</p>';
      return;
    }

    container.innerHTML = articles
      .map(
        (a) => `
    <div class="article-item">
      <div class="article-info">
        <div class="article-title">${escapeHtml(a.title)}</div>
        <div class="article-date">${formatDate(a.createdAt)}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm article-preview-btn" data-id="${a.id}">미리보기</button>
    </div>`,
      )
      .join("");

    container.querySelectorAll(".article-preview-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openArticle(Number(btn.dataset.id));
      });
    });
  } catch (err) {
    const error = normalizeError(err);
    container.innerHTML = `<p class="empty preview-error">${escapeHtml(error.message)}</p>`;
  }
}

async function clearRecentArticles() {
  const confirmed = window.confirm(
    "최근 원고를 모두 삭제할까요?\n\n· articles 테이블의 원고가 삭제됩니다.\n· drafted 주제는 farmed로 복원됩니다.\n· 발행 이력(published)과 플랫폼 세션은 유지됩니다.",
  );
  if (!confirmed) return;

  const btn = document.getElementById("articles-clear-btn");
  const msgEl = document.getElementById("run-message");
  if (btn) btn.disabled = true;
  if (msgEl) {
    msgEl.textContent = "최근 원고 초기화 중...";
    msgEl.className = "run-message";
  }

  try {
    const result = await api("/api/articles/clear", { method: "POST" });
    if (msgEl) {
      msgEl.textContent =
        result.message ??
        `원고 ${result.deletedArticles ?? 0}건을 초기화했습니다.`;
      msgEl.className = "run-message success";
    }
    await Promise.all([loadArticles(), loadStats()]);
  } catch (err) {
    const error = normalizeError(err);
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.className = "run-message error";
    }
    showErrorCard(error.message, "원고", error.hint);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadPublishedPosts() {
  const posts = await api("/api/published-posts?limit=15");
  const container = document.getElementById("published-list");
  if (!posts.length) {
    container.innerHTML = '<p class="empty">발행 이력이 없습니다.</p>';
    return;
  }

  container.innerHTML = posts
    .map(
      (p) => `
      <div class="published-item">
        <span class="platform-badge ${p.platform}">${PLATFORM_LABELS[p.platform] ?? p.platform}</span>
        <div>
          <div class="published-title">${escapeHtml(p.title)}</div>
          <div class="published-date">${formatDate(p.publishedAt)}</div>
        </div>
        <a class="published-link" href="${escapeHtml(p.postUrl)}" target="_blank" rel="noopener noreferrer">바로가기</a>
      </div>`,
    )
    .join("");
}

async function loadStats() {
  const stats = await api("/api/stats");
  document.getElementById("stat-farmed").textContent = stats.topics.farmed;
  document.getElementById("stat-drafted").textContent = stats.topics.drafted;
  document.getElementById("stat-published").textContent = stats.topics.published;
  document.getElementById("stat-articles").textContent = stats.articles;
}

async function loadLogs() {
  const data = await api("/api/logs?lines=150");
  lastLogs = data.lines ?? [];
  document.getElementById("logs").textContent =
    lastLogs.join("\n") || "로그가 없습니다.";
  renderLogsSummary(lastLogs, lastStatus?.job);
  if (lastStatus?.job) {
    renderActivityBox(lastStatus.job, lastLogs, {
      isRunning: lastStatus.isRunning,
      contentMode: lastStatus.config?.contentMode,
    });
    renderProgress(lastStatus.job, lastLogs, {
      isRunning: lastStatus.isRunning,
      contentMode: lastStatus.config?.contentMode,
    });
  }
}

async function refreshAll() {
  // 단계(스텝박스)와 아래 그래프(활동 미니바)가 같은 로그 스냅샷을 바라보도록
  // `loadLogs()` → `loadStatus()` 순서로 순차 실행합니다.
  await loadLogs();
  const status = await loadStatus();
  await Promise.allSettled([
    loadArticles(),
    loadStats(),
    ...(status?.isRunning ? [] : [loadPublishedPosts()]),
    loadInputHistory(),
    loadThumbnailBackground(),
  ]);
}

/** 헤더 새로고침: HTML·CSS·JS 캐시를 우회하는 강제 페이지 리로드 */
function hardRefreshPage() {
  const url = new URL(window.location.href);
  url.searchParams.set("_", String(Date.now()));
  window.location.replace(url.toString());
}

async function runPipelineStep(step) {
  const msgEl = document.getElementById("run-message");
  msgEl.textContent = `${STEP_LABELS[STEP_KEYS.indexOf(step)] ?? step} 단계 실행 중...`;
  msgEl.className = "run-message";
  clearErrorCard();

  try {
    const status = await loadStatus({ suppressErrorCard: true });
    clearErrorCard();

    const topicInput = document.getElementById("blog-topic");
    const regionInput = document.getElementById("blog-region");
    const blogTopic = topicInput?.value?.trim() || undefined;
    const region = regionInput?.value?.trim() || "";

    if (step === "content" && !blogTopic && !status.config.blogTopic) {
      throw {
        message: "블로그 주제를 입력하거나 Vercel에 BLOG_TOPIC 환경 변수를 설정하세요.",
        stage: "생성",
        hint: "키워드를 입력한 뒤 다시 실행하세요.",
      };
    }

    if (
      step === "publish" &&
      !status.config.publishDryRun
    ) {
      const enabled = (status.config.enabledPlatforms ?? DASHBOARD_PLATFORMS).filter(
        (p) => DASHBOARD_PLATFORMS.includes(p),
      );
      const details = status.sessionDetails;
      const missing = enabled.filter((p) =>
        details ? details[p]?.valid !== "ok" : !status.sessions[p],
      );
      if (missing.length > 0) {
        const labels = missing.map((p) => PLATFORM_LABELS[p] ?? p).join(" · ");
        throw {
          message: `${labels} 연결이 없습니다.`,
          stage: "발행",
          hint: "「계정 연결」에서 다시 로그인해 주세요.",
        };
      }
    }

    const blogRegion = region || undefined;
    const result = await api("/api/run/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, trigger: "web-step", blogTopic, blogRegion }),
    });

    if (result.title) {
      msgEl.textContent = `완료 (${step}): ${result.title}`;
    } else {
      msgEl.textContent = result.message;
    }
    msgEl.className = "run-message success";
    if (blogTopic || region) {
      rememberInput(blogTopic ?? "", region);
    }
    await refreshAll();
  } catch (err) {
    const error = normalizeError(err);
    msgEl.textContent = error.message;
    msgEl.className = "run-message error";
    showErrorCard(error.message, error.stage, error.hint);
  }
}

async function runPipeline() {
  const msgEl = document.getElementById("run-message");
  msgEl.textContent = "실행 중...";
  msgEl.className = "run-message";
  clearErrorCard();

  try {
    // 사전 검증용. 이전 실행이 error여도 새 실행 시작 전에는 실패 요약을 다시 띄우지 않음
    const status = await loadStatus({ suppressErrorCard: true });
    clearErrorCard();

    const topicInput = document.getElementById("blog-topic");
    const regionInput = document.getElementById("blog-region");
    const blogTopic = topicInput?.value?.trim() || undefined;
    const region = regionInput?.value?.trim() || "";

    if (!blogTopic && !status.config.blogTopic) {
      throw {
        message: "블로그 주제를 입력하거나 Vercel에 BLOG_TOPIC 환경 변수를 설정하세요.",
        stage: "생성",
        hint: "키워드를 입력한 뒤 다시 실행하세요.",
      };
    }

    if (!status.config.publishDryRun) {
      const enabled = (status.config.enabledPlatforms ?? DASHBOARD_PLATFORMS).filter(
        (p) => DASHBOARD_PLATFORMS.includes(p),
      );
      const details = status.sessionDetails;
      const missing = enabled.filter((p) =>
        details ? details[p]?.valid !== "ok" : !status.sessions[p],
      );
      if (missing.length > 0) {
        const labels = missing.map((p) => PLATFORM_LABELS[p] ?? p).join(" · ");
        throw {
          message: `${labels} 연결이 없습니다.`,
          stage: "발행",
          hint: "「계정 연결」에서 다시 로그인해 주세요.",
        };
      }
    }

    const blogRegion = region || undefined;
    const result = await api("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "web", blogTopic, blogRegion }),
    });
    if (result.title) {
      msgEl.textContent = `완료: ${result.title}`;
    } else {
      msgEl.textContent = result.message;
    }
    msgEl.className = "run-message success";
    rememberInput(blogTopic ?? "", region);
    await refreshAll();
  } catch (err) {
    const error = normalizeError(err);
    msgEl.textContent = error.message;
    msgEl.className = "run-message error";
    showErrorCard(error.message, error.stage, error.hint);
  }
}

function normalizeError(err) {
  if (err && typeof err === "object" && "message" in err) {
    return {
      message: String(err.message ?? "오류가 발생했습니다."),
      stage: String(err.stage ?? inferStageFromText(String(err.message))),
      hint: String(
        err.hint ?? "실행 로그를 확인한 뒤 해당 단계부터 다시 시도하세요.",
      ),
    };
  }
  const fallback = String(err ?? "오류가 발생했습니다.");
  return {
    message: fallback,
    stage: inferStageFromText(fallback),
    hint: "실행 로그를 확인해 주세요.",
  };
}

function toPlainTextLength(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, "").length;
}

function mountPreviewIframe(container, articleId) {
  const iframe = document.createElement("iframe");
  iframe.className = "article-preview-frame";
  iframe.title = "원고 본문 미리보기";
  iframe.src = `/api/articles/${articleId}/preview?ts=${Date.now()}`;
  container.append(iframe);
  return iframe;
}

async function openArticle(id) {
  const modal = document.getElementById("article-modal");
  const body = document.getElementById("modal-body");

  if (!modal || !body || !Number.isFinite(id) || id <= 0) {
    showErrorCard("미리보기를 열 수 없습니다.", "미리보기", "페이지를 새로고침 후 다시 시도해 주세요.");
    return;
  }

  try {
    body.innerHTML = '<p class="empty">원고를 불러오는 중...</p>';
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    const article = await api(`/api/articles/${id}`);
    const minChars = lastStatus?.config?.minPlainTextChars ?? 3500;
    const plainLen = toPlainTextLength(article.htmlBody ?? "");
    const gap = plainLen - minChars;

    document.getElementById("modal-title").textContent = article.title ?? "원고 미리보기";
    document.getElementById("modal-meta").textContent =
      `글자 수: ${plainLen.toLocaleString()}자 / 최소 기준: ${minChars.toLocaleString()}자 (${gap >= 0 ? `+${gap}` : gap})`;

    body.replaceChildren();
    const label = document.createElement("p");
    label.className = "preview-thumb-label";
    label.textContent = `썸네일 텍스트: ${article.thumbnailText ?? ""}`;
    body.append(label);
    mountPreviewIframe(body, id);
  } catch (err) {
    const error = normalizeError(err);
    body.innerHTML = `<p class="empty preview-error">${escapeHtml(error.message)}</p>`;
    document.getElementById("modal-meta").textContent = "";
    showErrorCard(error.message, "미리보기", error.hint);
  }
}

function closeModal() {
  document.getElementById("article-modal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
  const body = document.getElementById("modal-body");
  if (body) body.replaceChildren();
}

function openPlatformLogin(platform) {
  const screen = document.getElementById("platform-login-screen");
  const title = document.getElementById("platform-login-title");
  const desc = document.getElementById("platform-login-desc");
  const idLabel = document.getElementById("platform-login-id-label");
  const platformInput = document.getElementById("platform-login-platform");
  const username = document.getElementById("platform-login-username");
  const password = document.getElementById("platform-login-password");
  const statusEl = document.getElementById("platform-login-status");
  const envHint = document.getElementById("platform-login-env-hint");
  const envBtn = document.getElementById("platform-login-env-btn");
  const label = PLATFORM_LABELS[platform] ?? platform;

  if (!screen) return;

  platformInput.value = platform;
  title.textContent = `${label} 연결`;
  if (platform === "tistory") {
    desc.textContent = "카카오 아이디와 비밀번호로 연결합니다.";
    idLabel.textContent = "카카오 아이디";
  } else {
    desc.textContent = "네이버 아이디와 비밀번호를 입력해 주세요.";
    idLabel.textContent = "네이버 아이디";
  }

  username.value = "";
  password.value = "";
  statusEl.textContent = "";
  statusEl.className = "platform-login-status";

  const envOk = Boolean(envLoginAvailable?.[platform]);
  if (envHint && envBtn) {
    if (envOk) {
      envHint.classList.remove("hidden");
      envHint.textContent =
        "이미 등록된 계정이 있으면, 아래 버튼만으로도 연결할 수 있습니다.";
      envBtn.classList.remove("hidden");
      username.required = false;
      password.required = false;
    } else {
      envHint.classList.add("hidden");
      envBtn.classList.add("hidden");
      username.required = true;
      password.required = true;
    }
  }

  screen.classList.remove("hidden");
  document.body.classList.add("platform-login-open");
  username.focus();
}

function closePlatformLogin() {
  const screen = document.getElementById("platform-login-screen");
  screen?.classList.add("hidden");
  document.body.classList.remove("platform-login-open");
  const statusEl = document.getElementById("platform-login-status");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "platform-login-status";
  }
  const submit = document.getElementById("platform-login-submit");
  const envBtn = document.getElementById("platform-login-env-btn");
  if (submit) {
    submit.disabled = false;
    submit.textContent = "로그인하고 연결";
  }
  if (envBtn) envBtn.disabled = false;
}

async function handlePlatformLoginSubmit(event) {
  event.preventDefault();
  const platform = document.getElementById("platform-login-platform")?.value;
  if (!platform) return;
  const username = document.getElementById("platform-login-username")?.value?.trim() ?? "";
  const password = document.getElementById("platform-login-password")?.value ?? "";
  const envOk = Boolean(envLoginAvailable?.[platform]);

  if (!username || !password) {
    if (envOk) {
      await connectPlatform(platform);
      return;
    }
    const statusEl = document.getElementById("platform-login-status");
    if (statusEl) {
      statusEl.className = "platform-login-status error";
      statusEl.textContent = "아이디와 비밀번호를 입력해 주세요.";
    }
    return;
  }

  await connectPlatform(platform, { username, password });
}

function applyThumbnailBgPreference(preference) {
  const statusEl = document.getElementById("thumb-bg-status");
  const hintEl = document.getElementById("thumb-bg-hint");
  const previewWrap = document.getElementById("thumb-bg-preview-wrap");
  const previewImg = document.getElementById("thumb-bg-preview");

  if (!statusEl || !hintEl) return;

  hintEl.textContent =
    preference?.message ??
    "배경이 설정되지 않았습니다. 이미지를 업로드하거나 샘플을 선택하세요.";

  if (preference?.source === "upload") {
    statusEl.textContent = "업로드됨";
    statusEl.className = "badge upload-status success";
    if (previewWrap && previewImg) {
      previewWrap.classList.remove("hidden");
      previewImg.src = `/api/thumbnail-background/image?ts=${Date.now()}`;
    }
  } else if (preference?.source === "sample") {
    statusEl.textContent = preference.sampleName
      ? `샘플 · ${preference.sampleName}`
      : "샘플 선택됨";
    statusEl.className = "badge upload-status success";
    previewWrap?.classList.add("hidden");
    if (previewImg) previewImg.removeAttribute("src");
  } else {
    statusEl.textContent = "미설정";
    statusEl.className = "badge upload-status idle";
    previewWrap?.classList.add("hidden");
    if (previewImg) previewImg.removeAttribute("src");
  }

  document.querySelectorAll(".thumb-bg-sample").forEach((btn) => {
    const selected =
      preference?.source === "sample" &&
      btn.dataset.sampleId === preference.sampleId;
    btn.classList.toggle("selected", selected);
  });
}

function renderThumbnailSamples(samples, preference) {
  const container = document.getElementById("thumb-bg-samples");
  if (!container) return;

  if (!samples?.length) {
    container.innerHTML =
      '<p class="empty">표시할 샘플 배경이 없습니다.</p>';
    return;
  }

  container.innerHTML = samples
    .map((sample) => {
      const selected =
        preference?.source === "sample" && preference.sampleId === sample.id
          ? " selected"
          : "";
      return `<button type="button" class="thumb-bg-sample${selected}" data-sample-id="${escapeHtml(sample.id)}" title="${escapeHtml(sample.name)}">
        <span class="thumb-bg-sample-swatch" style="background:${escapeHtml(sample.gradient)}"></span>
        <span class="thumb-bg-sample-name">${escapeHtml(sample.name)}</span>
        <p class="thumb-bg-sample-desc">${escapeHtml(sample.description)}</p>
      </button>`;
    })
    .join("");

  container.querySelectorAll(".thumb-bg-sample").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.sampleId;
      if (id) void selectThumbnailSample(id);
    });
  });
}

async function loadThumbnailBackground() {
  const msgEl = document.getElementById("thumb-bg-message");
  try {
    const data = await api("/api/thumbnail-background");
    renderThumbnailSamples(data.samples ?? [], data.preference);
    applyThumbnailBgPreference(data.preference);
  } catch (err) {
    const error = normalizeError(err);
    const container = document.getElementById("thumb-bg-samples");
    if (container && !container.querySelector(".thumb-bg-sample")) {
      container.innerHTML =
        '<p class="empty">샘플을 불러오지 못했습니다. 새로고침해 주세요.</p>';
    }
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.style.color = "var(--error)";
    }
  }
}

async function uploadThumbnailBackground(file) {
  const msgEl = document.getElementById("thumb-bg-message");
  if (!msgEl) return;

  msgEl.style.color = "var(--text-muted)";
  msgEl.textContent = "배경 이미지 업로드 중…";

  try {
    if (!file.type.startsWith("image/")) {
      throw {
        message: "이미지 파일만 업로드할 수 있습니다.",
        stage: "썸네일",
        hint: "PNG, JPEG, WebP 파일을 선택하세요.",
      };
    }
    if (file.size > 2 * 1024 * 1024) {
      throw {
        message: "이미지 크기는 2MB 이하여야 합니다.",
        stage: "썸네일",
      };
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
      reader.readAsDataURL(file);
    });

    const result = await api("/api/thumbnail-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upload",
        imageBase64: dataUrl,
        mimeType: file.type || "image/png",
      }),
    });

    applyThumbnailBgPreference(result.preference);
    document.querySelectorAll(".thumb-bg-sample").forEach((btn) => {
      btn.classList.remove("selected");
    });
    msgEl.textContent = "배경 이미지 업로드 완료 — 이후 썸네일 생성에 사용됩니다.";
    msgEl.style.color = "var(--success)";
  } catch (err) {
    const error = normalizeError(err);
    const hint =
      /404|실패 \(404\)/.test(error.message)
        ? "배포가 최신 코드가 아닐 수 있습니다. Vercel Redeploy 후 다시 시도하세요."
        : error.hint;
    msgEl.textContent = `${error.message}${hint ? ` — ${hint}` : ""}`;
    msgEl.style.color = "var(--error)";
  } finally {
    const input = document.getElementById("upload-thumb-bg");
    if (input) input.value = "";
  }
}

async function selectThumbnailSample(sampleId) {
  const msgEl = document.getElementById("thumb-bg-message");
  if (msgEl) {
    msgEl.style.color = "var(--text-muted)";
    msgEl.textContent = "샘플 배경 적용 중…";
  }
  try {
    const result = await api("/api/thumbnail-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sample", sampleId }),
    });
    applyThumbnailBgPreference(result.preference);
    if (msgEl) {
      msgEl.textContent =
        result.preference?.message ?? "샘플 배경이 적용되었습니다.";
      msgEl.style.color = "var(--success)";
    }
  } catch (err) {
    const error = normalizeError(err);
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.style.color = "var(--error)";
    }
  }
}

async function clearThumbnailBackground() {
  const msgEl = document.getElementById("thumb-bg-message");
  if (msgEl) {
    msgEl.style.color = "var(--text-muted)";
    msgEl.textContent = "배경 설정 해제 중…";
  }
  try {
    const result = await api("/api/thumbnail-background", {
      method: "DELETE",
    });
    applyThumbnailBgPreference(result.preference);
    if (msgEl) {
      msgEl.textContent =
        "배경 설정을 해제했습니다. 기본(bg.png 또는 그라데이션)을 사용합니다.";
      msgEl.style.color = "var(--success)";
    }
  } catch (err) {
    const error = normalizeError(err);
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.style.color = "var(--error)";
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      await loadLogs();
      const data = await loadStatus();
      if (!data.isRunning) {
        await loadPublishedPosts();
      }
    } catch {
      // ignore poll errors
    }
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function showAuthScreen() {
  stopPolling();
  currentUser = null;
  document.getElementById("auth-screen")?.classList.remove("hidden");
  document.getElementById("app")?.classList.add("hidden");
  document.getElementById("logout-btn")?.setAttribute("hidden", "");
  document.getElementById("auth-user-label")?.setAttribute("hidden", "");
}

function showDashboard(user) {
  currentUser = user;
  document.getElementById("auth-screen")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  const label = document.getElementById("auth-user-label");
  const logoutBtn = document.getElementById("logout-btn");
  if (label) {
    label.textContent = user?.username ? `@${user.username}` : "";
    label.removeAttribute("hidden");
  }
  logoutBtn?.removeAttribute("hidden");
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authMode === authMode);
  });
  const submit = document.getElementById("auth-submit");
  if (submit) {
    submit.textContent = authMode === "signup" ? "회원가입" : "로그인";
  }
  const password = document.getElementById("auth-password");
  if (password) {
    password.autocomplete =
      authMode === "signup" ? "new-password" : "current-password";
  }
  const msg = document.getElementById("auth-message");
  if (msg) {
    msg.textContent = "";
    msg.className = "auth-message";
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("auth-username")?.value?.trim() ?? "";
  const password = document.getElementById("auth-password")?.value ?? "";
  const msg = document.getElementById("auth-message");
  const submit = document.getElementById("auth-submit");
  if (submit) submit.disabled = true;
  try {
    const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const data = await api(path, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    showDashboard(data.user);
    startPolling();
    await refreshAll();
  } catch (err) {
    if (msg) {
      msg.textContent = err.message ?? "인증에 실패했습니다.";
      msg.className = "auth-message error";
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  showAuthScreen();
}

async function checkAuth() {
  try {
    const data = await fetch("/api/auth/me", { credentials: "include" }).then(
      (r) => r.json(),
    );
    if (data?.authenticated && data.user) {
      showDashboard(data.user);
      return true;
    }
  } catch {
    /* ignore */
  }
  showAuthScreen();
  return false;
}

function purgeLegacyLoginUi() {
  document.getElementById("login-screen")?.remove();
  document.querySelector(".login-screen")?.remove();
  document.getElementById("api-key-input")?.closest(".login-card")?.remove();
}

async function init() {
  purgeLegacyLoginUi();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
  });
  document.getElementById("auth-form")?.addEventListener("submit", (e) => {
    void handleAuthSubmit(e);
  });
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    void handleLogout();
  });

  document.getElementById("refresh-btn").addEventListener("click", hardRefreshPage);
  document.getElementById("run-btn").addEventListener("click", runPipeline);
  document
    .getElementById("articles-clear-btn")
    ?.addEventListener("click", () => void clearRecentArticles());
  document.getElementById("pipeline-progress")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".step-run-btn");
    if (!btn || btn.disabled) return;
    const step = btn.dataset.step;
    if (step) void runPipelineStep(step);
  });
  document.getElementById("logs-refresh").addEventListener("click", loadLogs);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document
    .querySelector(".modal-backdrop")
    ?.addEventListener("click", closeModal);

  document.getElementById("upload-thumb-bg")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) void uploadThumbnailBackground(file);
  });
  document.getElementById("thumb-bg-clear-btn")?.addEventListener("click", () => {
    void clearThumbnailBackground();
  });

  document.querySelectorAll(".btn-connect").forEach((btn) => {
    btn.addEventListener("click", () => {
      const platform = btn.dataset.platform;
      if (platform) openPlatformLogin(platform);
    });
  });
  document
    .getElementById("platform-login-back")
    ?.addEventListener("click", () => closePlatformLogin());
  document
    .getElementById("platform-login-form")
    ?.addEventListener("submit", (e) => void handlePlatformLoginSubmit(e));
  document
    .getElementById("platform-login-env-btn")
    ?.addEventListener("click", () => {
      const platform = document.getElementById("platform-login-platform")?.value;
      if (platform) void connectPlatform(platform);
    });

  for (const [retryId, manualId, previewId] of [
    ["connect-retry-btn", "connect-manual-btn", "connect-preview-btn"],
    ["platform-login-retry-btn", "platform-login-manual-btn", "platform-login-preview-btn"],
  ]) {
    document.getElementById(retryId)?.addEventListener("click", handleConnectRetry);
    document.getElementById(manualId)?.addEventListener("click", handleConnectManual);
    document.getElementById(previewId)?.addEventListener("click", handleConnectManual);
  }

  const ok = await checkAuth();
  if (!ok) return;

  startPolling();

  try {
    await refreshAll();
  } catch (err) {
    const error = normalizeError(err);
    if (/로그인이 필요|인증된 사용자/i.test(error.message)) {
      showAuthScreen();
      return;
    }
    const msgEl = document.getElementById("run-message");
    msgEl.textContent = error.message;
    msgEl.className = "run-message error";
    const stage = isInfraErrorText(error.message) ? "연결" : error.stage;
    showErrorCard(
      error.message,
      stage,
      error.hint ??
        "계정 연결 상태를 확인한 뒤 새로고침해 주세요.",
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}