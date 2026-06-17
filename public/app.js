const API_KEY_STORAGE = "blog-orchestrator-api-key";

let pollTimer = null;

function getApiKey() {
  return sessionStorage.getItem(API_KEY_STORAGE) ?? "";
}

function setApiKey(key) {
  sessionStorage.setItem(API_KEY_STORAGE, key);
}

function clearApiKey() {
  sessionStorage.removeItem(API_KEY_STORAGE);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const key = getApiKey();
  if (key) headers["X-API-Key"] = key;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    showLogin();
    throw new Error("인증이 필요합니다.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `요청 실패 (${res.status})`);
  }
  return res.json();
}

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  stopPolling();
}

function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  startPolling();
}

function statusBadgeClass(status) {
  return `badge ${status ?? "idle"}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR");
}

async function loadStatus() {
  const data = await api("/api/status");
  const job = data.job;

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
  if (job.lastError) detail.push(`오류: ${job.lastError}`);
  document.getElementById("job-detail").textContent =
    detail.join(" · ") || "아직 실행 이력이 없습니다.";

  document.getElementById("cron-schedule").textContent =
    data.config.cronSchedule;
  document.getElementById("cron-timezone").textContent =
    data.config.cronTimezone;
  document.getElementById("dry-run").textContent = data.config.publishDryRun
    ? "테스트 (발행 안 함)"
    : "실제 발행";

  const sessions = [];
  if (data.sessions.naver) sessions.push("네이버 ✓");
  else sessions.push("네이버 ✗");
  if (data.sessions.tistory) sessions.push("티스토리 ✓");
  else sessions.push("티스토리 ✗");
  document.getElementById("session-status").textContent = sessions.join(" · ");

  const runBtn = document.getElementById("run-btn");
  runBtn.disabled = data.isRunning;

  return data;
}

async function loadArticles() {
  const articles = await api("/api/articles?limit=10");
  const container = document.getElementById("articles-list");

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
      <button class="btn btn-ghost btn-sm" data-id="${a.id}">미리보기</button>
    </div>`,
    )
    .join("");

  container.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openArticle(Number(btn.dataset.id)),
    );
  });
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
  document.getElementById("logs").textContent =
    data.lines.join("\n") || "로그가 없습니다.";
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadArticles(), loadStats(), loadLogs()]);
}

async function runPipeline() {
  const msgEl = document.getElementById("run-message");
  msgEl.textContent = "실행 중...";
  msgEl.className = "run-message";

  try {
    const result = await api("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "web" }),
    });
    if (result.title) {
      msgEl.textContent = `완료: ${result.title}`;
    } else {
      msgEl.textContent = result.message;
    }
    msgEl.className = "run-message success";
    await refreshAll();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = "run-message error";
  }
}

async function openArticle(id) {
  const article = await api(`/api/articles/${id}`);
  document.getElementById("modal-title").textContent = article.title;

  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <p style="color:var(--text-muted);margin-bottom:12px">
      썸네일 텍스트: ${escapeHtml(article.thumbnailText)}
    </p>
    <div>${article.htmlBody}</div>
  `;

  document.getElementById("article-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("article-modal").classList.add("hidden");
}

async function uploadSession(platform, file) {
  const text = await file.text();
  const json = JSON.parse(text);
  const msgEl = document.getElementById("upload-message");

  try {
    await api(`/api/sessions/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });
    msgEl.textContent = `${platform} 세션 업로드 완료`;
    await loadStatus();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.style.color = "var(--error)";
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const data = await loadStatus();
      if (data.isRunning) {
        await loadLogs();
      }
    } catch {
      /* ignore poll errors */
    }
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function tryLogin() {
  const input = document.getElementById("api-key-input");
  const errorEl = document.getElementById("login-error");
  const key = input.value.trim();

  if (!key) {
    errorEl.textContent = "API 키를 입력하세요.";
    errorEl.classList.remove("hidden");
    return;
  }

  setApiKey(key);

  try {
    const status = await api("/api/status");
    if (status.config.authRequired === false && !key) {
      /* 로컬 개발 모드 */
    }
    errorEl.classList.add("hidden");
    showApp();
    await refreshAll();
  } catch {
    clearApiKey();
    errorEl.textContent = "API 키가 올바르지 않습니다.";
    errorEl.classList.remove("hidden");
  }
}

async function init() {
  document.getElementById("login-btn").addEventListener("click", tryLogin);
  document.getElementById("api-key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryLogin();
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    clearApiKey();
    showLogin();
  });
  document.getElementById("refresh-btn").addEventListener("click", refreshAll);
  document.getElementById("run-btn").addEventListener("click", runPipeline);
  document.getElementById("logs-refresh").addEventListener("click", loadLogs);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document
    .querySelector(".modal-backdrop")
    .addEventListener("click", closeModal);

  document.getElementById("upload-naver").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadSession("naver", file);
  });
  document.getElementById("upload-tistory").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadSession("tistory", file);
  });

  // API_KEY 미설정(로컬)이면 바로 접속, 설정됐으면 로그인 화면
  try {
    const meta = await fetch("/api/meta").then((r) => r.json());
    if (!meta.authRequired) {
      showApp();
      await refreshAll();
      return;
    }
  } catch {
    /* 서버 미기동 */
  }

  if (getApiKey()) {
    try {
      showApp();
      await refreshAll();
      return;
    } catch {
      clearApiKey();
    }
  }

  showLogin();
}

init();
