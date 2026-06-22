import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";
import { FarmingAgent } from "./agents/farming-agent.js";
import { TitleAgent } from "./agents/title-agent.js";
import { ContentAgent } from "./agents/content-agent.js";
import { ThumbnailTextAgent } from "./agents/thumbnail-text-agent.js";
import { GemsAgent } from "./agents/gems-agent.js";
import { applyBlogStyle } from "./blog-style/apply-style.js";
import {
  buildTopLabelFromKeywords,
  extractInputKeywordPhrases,
} from "../publishing/images/keyword-slug.js";
import {
  refreshThumbnailTexts,
  thumbnailMatchesTopic,
} from "../thumbnail/resolve-thumbnail-texts.js";
import {
  pickBlogRegions,
  resolveBlogRegionInput,
} from "./regions/pick-regions.js";
import { refineTitleAndThumbnail } from "./seo/title-seo-refiner.js";
import { TopicRepository } from "./farming/topic-repository.js";
import type { ArticleDraft, ContentRunOptions, RawTopic } from "./types.js";

/**
 * Phase 2 콘텐츠 생성 파이프라인.
 *
 * CONTENT_MODE=rss  → RSS 수집 + 4단계 에이전트
 * CONTENT_MODE=gems → 사용자 지정 주제 + Gems 프롬프트 (API는 OpenAI/Gemini 선택)
 */
export class ContentPipeline {
  private readonly repo: TopicRepository;
  private readonly farmingAgent: FarmingAgent;
  private readonly titleAgent: TitleAgent;
  private readonly contentAgent: ContentAgent;
  private readonly thumbnailTextAgent: ThumbnailTextAgent;
  private readonly gemsAgent: GemsAgent;

  constructor(repo?: TopicRepository) {
    this.repo = repo ?? new TopicRepository();
    this.farmingAgent = new FarmingAgent(this.repo);
    this.titleAgent = new TitleAgent();
    this.contentAgent = new ContentAgent();
    this.thumbnailTextAgent = new ThumbnailTextAgent();
    this.gemsAgent = new GemsAgent();
  }

  async run(options: ContentRunOptions = {}): Promise<ArticleDraft> {
    console.log("\n═══ Phase 2: 콘텐츠 생성 파이프라인 ═══\n");
    console.log(`[Content] 모드: ${config.contentMode}`);
    if (config.contentMode === "gems") {
      const model =
        config.llmProvider === "gemini"
          ? config.geminiModel
          : config.openaiModel;
      console.log(
        `[Content] LLM: ${config.llmProvider} / ${model} | Gems 프롬프트: ${config.gemsPromptPath}`,
      );
      return this.runGemsMode(
        options.blogTopic,
        options.forceRegenerate,
        options.blogRegion,
      );
    }
    return this.runRssMode();
  }

  /** RSS 자동 수집 + OpenAI/Gemini 4단계 에이전트 */
  private async runRssMode(): Promise<ArticleDraft> {
    const { topicId, topic } = await this.farmingAgent.run();
    const title = await this.titleAgent.run(topic);
    const htmlBody = await this.contentAgent.run(title, topic);
    const thumbnailText = await this.thumbnailTextAgent.run(title, topic.title);

    return this.saveDraft({
      topicId,
      sourceTopic: topic,
      title,
      htmlBody,
      thumbnailText,
    });
  }

  /** 사용자 지정 주제 + Gems 프롬프트 단일 생성 */
  private async runGemsMode(
    blogTopicOverride?: string,
    forceRegenerate?: boolean,
    blogRegionOverride?: string,
  ): Promise<ArticleDraft> {
    const blogTopic = blogTopicOverride?.trim() || config.blogTopic;
    if (!blogTopic) {
      throw new Error(
        "gems 모드에는 블로그 주제가 필요합니다.\n" +
          "  • npm run run:once 실행 시 입력\n" +
          "  • npm run run:once -- --topic \"키워드1, 키워드2\"\n" +
          "  • .env BLOG_TOPIC 설정",
      );
    }

    const topic: RawTopic = {
      sourceUrl: `gems://manual/${encodeURIComponent(blogTopic)}`,
      title: blogTopic,
      summary: blogTopic,
      sourceFeed: "gems-manual",
    };

    const existing = await this.repo.getTopicBySourceUrl(topic.sourceUrl);
    const shouldForceRegenerate = forceRegenerate ?? config.forceRegenerate;

    if (existing) {
      // 강제 재생성
      if (shouldForceRegenerate) {
        console.log(`[Gems] 기존 주제 삭제 후 재생성 (forceRegenerate)`);
        await this.repo.deleteTopicAndArticles(topic.sourceUrl);
      }
      // 기존 원고 재사용 (drafted 또는 RETRY_PUBLISH 시 published 포함)
      else if (
        existing.status === "drafted" ||
        (existing.status === "published" && config.retryPublish)
      ) {
        const draft = await this.repo.getLatestArticleByTopicId(existing.id);
        if (draft) {
          const label =
            existing.status === "published" ? "퍼블리싱 재시도" : "원고 재사용";
          console.log(
            `[Gems] 기존 원고 ${label} (topic id=${existing.id}) — AI 생성 생략`,
          );
          console.log(`[Gems] 제목: ${draft.title}`);
          if (existing.status === "published") {
            await this.repo.updateStatus(existing.id, "drafted");
          }
          return draft;
        }
        await this.repo.deleteTopicAndArticles(topic.sourceUrl);
        console.log(`[Gems] 원고 없는 레코드 정리 후 재생성`);
      }
      // 이미 발행 완료된 주제 (재시도 옵션 없음)
      else if (existing.status === "published") {
        throw new Error(
          `이미 발행 완료된 주제입니다: "${blogTopic}"\n` +
            `RETRY_PUBLISH=true 로 퍼블리싱만 재시도하거나,\n` +
            `BLOG_TOPIC을 변경하거나 FORCE_REGENERATE=true 로 재생성하세요.`,
        );
      }
      // farmed 등 원고 없는 중복
      else if (!shouldForceRegenerate) {
        await this.repo.deleteTopicAndArticles(topic.sourceUrl);
        console.log(`[Gems] 불완전한 기존 레코드 정리 후 재생성`);
      }
    }

    const topicId = await this.repo.insertTopic(topic);

    const regionInput = await resolveBlogRegionInput(blogRegionOverride);
    const regionPick = pickBlogRegions(regionInput);
    console.log(
      `[Gems] 지역 풀: ${regionPick.parentName} → ${regionPick.pickedShort.join("·")}`,
    );

    const gems = await this.gemsAgent.run(blogTopic, regionPick);

    const seoRefined = await refineTitleAndThumbnail({
      topic: blogTopic,
      title: gems.title,
      thumbnailText: gems.thumbnailText,
      thumbnailTopLabel: gems.thumbnailTopLabel,
      region: regionPick,
    });

    const inputPhrases = extractInputKeywordPhrases(blogTopic);
    let thumbnailTopLabel =
      seoRefined.thumbnailTopLabel ||
      gems.thumbnailTopLabel ||
      buildTopLabelFromKeywords(
        inputPhrases.length > 0
          ? inputPhrases
          : blogTopic.split(/[,，/|·]+/).map((s) => s.trim()).filter(Boolean),
      );
    let thumbnailText = seoRefined.thumbnailText;
    const finalTitle = seoRefined.title;

    if (
      !thumbnailMatchesTopic(
        blogTopic,
        finalTitle,
        thumbnailTopLabel,
        thumbnailText,
      )
    ) {
      console.log("[Gems] 썸네일 문구가 키워드와 불일치 — 재생성");
      const refreshed = await refreshThumbnailTexts(blogTopic, finalTitle);
      thumbnailTopLabel = refreshed.topLabel;
      thumbnailText = refreshed.mainText;
    }

    return this.saveDraft({
      topicId,
      sourceTopic: topic,
      title: finalTitle,
      htmlBody: gems.htmlBody,
      thumbnailText,
      thumbnailTopLabel,
      blogRegion: regionPick.parentName,
      pickedLocalities: regionPick.pickedShort,
    });
  }

  private async saveDraft(
    draft: Omit<ArticleDraft, "createdAt">,
  ): Promise<ArticleDraft> {
    const fullDraft: ArticleDraft = {
      ...draft,
      htmlBody: applyBlogStyle(draft.htmlBody),
      createdAt: new Date().toISOString(),
    };

    const articleId = await this.repo.saveArticle(fullDraft);
    const draftPath = await this.saveDraftFile(fullDraft, articleId);

    console.log(`\n✅ 원고 저장 완료 (article id=${articleId})`);
    if (draftPath) {
      console.log(`   파일: ${draftPath}`);
    }

    return fullDraft;
  }

  private async saveDraftFile(
    draft: ArticleDraft,
    articleId: number,
  ): Promise<string | null> {
    try {
      await fs.mkdir(config.draftsDir, { recursive: true });

      const filename = `${articleId}_${Date.now()}.json`;
      const filePath = path.join(config.draftsDir, filename);

      await fs.writeFile(filePath, JSON.stringify(draft, null, 2), "utf-8");
      return filePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Content] 원고 파일 저장 생략 (DB에는 저장됨): ${message}`);
      return null;
    }
  }

  close(): void {
    this.repo.close();
  }
}
