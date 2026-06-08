import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";
import { FarmingAgent } from "./agents/farming-agent.js";
import { TitleAgent } from "./agents/title-agent.js";
import { ContentAgent } from "./agents/content-agent.js";
import { ThumbnailTextAgent } from "./agents/thumbnail-text-agent.js";
import { TopicRepository } from "./farming/topic-repository.js";
import type { ArticleDraft } from "./types.js";

/**
 * Phase 2 콘텐츠 생성 파이프라인.
 * Farming → Title → Content → ThumbnailText 순서로 실행합니다.
 */
export class ContentPipeline {
  private readonly repo: TopicRepository;
  private readonly farmingAgent: FarmingAgent;
  private readonly titleAgent: TitleAgent;
  private readonly contentAgent: ContentAgent;
  private readonly thumbnailTextAgent: ThumbnailTextAgent;

  constructor(repo?: TopicRepository) {
    this.repo = repo ?? new TopicRepository();
    this.farmingAgent = new FarmingAgent(this.repo);
    this.titleAgent = new TitleAgent();
    this.contentAgent = new ContentAgent();
    this.thumbnailTextAgent = new ThumbnailTextAgent();
  }

  async run(): Promise<ArticleDraft> {
    console.log("\n═══ Phase 2: 콘텐츠 생성 파이프라인 ═══\n");

    const { topicId, topic } = await this.farmingAgent.run();
    const title = await this.titleAgent.run(topic);
    const htmlBody = await this.contentAgent.run(title, topic);
    const thumbnailText = await this.thumbnailTextAgent.run(title);

    const draft: ArticleDraft = {
      topicId,
      sourceTopic: topic,
      title,
      htmlBody,
      thumbnailText,
      createdAt: new Date().toISOString(),
    };

    const articleId = this.repo.saveArticle(draft);
    const draftPath = await this.saveDraftFile(draft, articleId);

    console.log(`\n✅ 원고 저장 완료 (article id=${articleId})`);
    console.log(`   파일: ${draftPath}`);

    return draft;
  }

  /** 디버깅용 JSON 백업 저장 */
  private async saveDraftFile(
    draft: ArticleDraft,
    articleId: number,
  ): Promise<string> {
    await fs.mkdir(config.draftsDir, { recursive: true });

    const filename = `${articleId}_${Date.now()}.json`;
    const filePath = path.join(config.draftsDir, filename);

    await fs.writeFile(filePath, JSON.stringify(draft, null, 2), "utf-8");
    return filePath;
  }

  close(): void {
    this.repo.close();
  }
}
