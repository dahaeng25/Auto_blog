const PLATFORM_LABELS = {
  naver: "네이버",
  tistory: "티스토리",
  google: "Google",
};

const STEP_LABELS = ["수집", "생성", "썸네일", "발행"];
let pollTimer = null;
let lastLogs = [];
let lastStatus = null;

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = body.error ?? body.message ?? `요청 실패 (${res.status})`;
    const stage = body.stage ?? inferStageFromText(error);
    const hint =
      body.hint ??
      "실행 로그를 확인한 뒤, 해당 단계 버튼부터 다시 실행해 주세요.";
    throw { message: error, stage, hint };
  }
  return res.json();
}

function formatSessionStatus(sessions, enabledPlatforms) {
  const platforms =
    enabledPlatforms?.length > 0
      ? enabledPlatforms
      : Object.keys(PLATFORM_LABELS);
  return platforms
    .map((p) => {
      const label = PLATFORM_LABELS[p] ?? p;
      return sessions[p] ? `${label} ✓` : `${label} ✗`;
    })
    .join(" · ");
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
    t.includes("gems") ||
    t.includes("생성") ||
    t.includes("title") ||
    t.includes("content")
  ) {
    return "생성";
  }
  if (t.includes("thumbnail") || t.includes("썸네일")) return "썸네일";
  if (
    t.includes("publish") ||
    t.includes("업로드") ||
    t.includes("네이버") ||
    t.includes("티스토리") ||
    t.includes("blogger")
  ) {
    return "발행";
  }
  return "생성";
}

function inferCurrentStage(job, logs) {
  if (job?.status === "success") return "done";
  if (job?.status === "error") return inferStageFromText(job.lastError);
  if (job?.status !== "running") return "idle";
  const text = [...logs].reverse().join("\n");
  return inferStageFromText(text);
}

function renderProgress(job, logs) {
  const container = document.getElementById("pipeline-progress");
  const stage = inferCurrentStage(job, logs);
  const stageIndex = STEP_LABELS.indexOf(stage);

  container.innerHTML = STEP_LABELS.map((label, i) => {
    let stateClass = "waiting";
    let stateText = "대기";

    if (job?.status === "success" || i < stageIndex) {
      stateClass = "done";
      stateText = "완료";
    } else if (job?.status === "error" && i === stageIndex) {
      stateClass = "error";
      stateText = "실패";
    } else if (job?.status === "running" && i === stageIndex) {
      stateClass = "running";
      stateText = "진행중";
    }

    return `
      <div class="progress-step ${stateClass}">
        <span class="step-index">Step ${i + 1}</span>
        <span class="step-label">${label}</span>
        <span class="step-state">${stateText}</span>
      </div>
    `;
  }).join("");
}

function showErrorCard(errorText, stage, hint) {
  const card = document.getElementById("error-card");
  const body = document.getElementById("error-card-body");
  body.innerHTML = `
    <p class="error-summary">[${stage}] 단계에서 실패했습니다.</p>
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

  const sessions = formatSessionStatus(
    data.sessions,
    data.config.enabledPlatforms,
  );
  document.getElementById("session-status").textContent = sessions;
  document.getElementById("run-btn").disabled = data.isRunning;

  renderProgress(job, lastLogs);

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
    btn.addEventListener("click", () => openArticle(Number(btn.dataset.id)));
  });
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
}

async function refreshAll() {
  await Promise.all([
    loadLogs(),
    loadStatus(),
    loadArticles(),
    loadStats(),
    loadPublishedPosts(),
    loadInputHistory(),
  ]);
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
      const enabled = status.config.enabledPlatforms ?? ["naver", "tistory"];
      const missing = enabled.filter((p) => !status.sessions[p]);
      if (missing.length > 0) {
        const labels = missing.map((p) => PLATFORM_LABELS[p] ?? p).join(" · ");
        throw {
          message: `${labels} 세션이 없습니다.`,
          stage: "발행",
          hint: "하단 세션 업로드에서 auth/*_state.json 을 업로드하세요.",
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

async function openArticle(id) {
  const article = await api(`/api/articles/${id}`);
  const minChars = lastStatus?.config?.minPlainTextChars ?? 3500;
  const plainLen = toPlainTextLength(article.htmlBody);
  const gap = plainLen - minChars;

  document.getElementById("modal-title").textContent = article.title;
  document.getElementById("modal-meta").textContent =
    `글자 수: ${plainLen.toLocaleString()}자 / 최소 기준: ${minChars.toLocaleString()}자 (${gap >= 0 ? `+${gap}` : gap})`;

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
  const msgEl = document.getElementById("upload-message");
  msgEl.style.color = "var(--text-muted)";
  msgEl.textContent = `${platform} 세션 업로드 중...`;

  try {
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw {
        message: "JSON 파일이 아닙니다. auth/*_state.json 을 선택하세요.",
        stage: "발행",
        hint: "npm run auth:setup 으로 생성된 파일을 업로드하세요.",
      };
    }

    await api(`/api/sessions/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });
    msgEl.textContent = `${platform} 세션 업로드 완료`;
    msgEl.style.color = "var(--success)";
    await loadStatus();
  } catch (err) {
    const error = normalizeError(err);
    const hint =
      /404|실패 \(404\)/.test(error.message)
        ? "배포가 최신 코드가 아닐 수 있습니다. Vercel Redeploy 후 다시 시도하세요."
        : error.hint;
    msgEl.textContent = `${error.message}${hint ? ` — ${hint}` : ""}`;
    msgEl.style.color = "var(--error)";
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

function purgeLegacyLoginUi() {
  document.getElementById("login-screen")?.remove();
  document.querySelector(".login-screen")?.remove();
  document.getElementById("api-key-input")?.closest(".login-card")?.remove();
  document.getElementById("app")?.classList.remove("hidden");
  document.body.style.overflow = "";
}

async function init() {
  purgeLegacyLoginUi();

  document.getElementById("refresh-btn").addEventListener("click", refreshAll);
  document.getElementById("run-btn").addEventListener("click", runPipeline);
  document.getElementById("logs-refresh").addEventListener("click", loadLogs);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document
    .querySelector(".modal-backdrop")
    ?.addEventListener("click", closeModal);

  document.getElementById("upload-naver")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadSession("naver", file);
  });
  document.getElementById("upload-tistory")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadSession("tistory", file);
  });
  document.getElementById("upload-google")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadSession("google", file);
  });

  startPolling();

  try {
    await refreshAll();
  } catch (err) {
    const error = normalizeError(err);
    const msgEl = document.getElementById("run-message");
    msgEl.textContent = error.message;
    msgEl.className = "run-message error";
    showErrorCard(error.message, error.stage, error.hint);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}