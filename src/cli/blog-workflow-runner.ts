import { logger } from "../monitoring/logger.js";
import { notifyError } from "../monitoring/discord-notifier.js";
import {
  promptContinue,
  waitForEnter,
  type WorkflowMode,
  type WorkflowRunOptions,
  type WorkflowStep,
} from "./workflow/shared.js";
import { runContentStep } from "./workflow/content-step.js";
import { runEditStep } from "./workflow/edit-step.js";
import {
  runCheckImportStep,
  runImportFullWorkflow,
  runImportResumeStep,
  runImportStep,
} from "./workflow/import-step.js";
import {
  runThumbnailPreviewStep,
  runThumbnailStep,
} from "./workflow/thumbnail-step.js";
import { runPublishStep } from "./workflow/publish-step.js";
import { writePreviewHtml } from "./draft-workspace.js";

export type { WorkflowMode, WorkflowRunOptions, WorkflowStep };
export {
  runCheckImportStep,
  runContentStep,
  runEditStep,
  runImportFullWorkflow,
  runImportResumeStep,
  runImportStep,
  runPublishStep,
  runThumbnailPreviewStep,
  runThumbnailStep,
};

/**
 * 전체: AI 글작성 → 편집 → 썸네일 → 업로드.
 */
export async function runFullWorkflow(
  options: WorkflowRunOptions,
): Promise<void> {
  console.log("\n═══ AI 자동 모드 (글작성 → 검토 → 썸네일 → 업로드) ═══\n");

  await runContentStep(options);

  if (!options.skipEditPrompt) {
    if (options.batchMode) {
      console.log("\n[배치] 원고 검토는 메뉴 [4]에서 진행한 뒤 [5] 썸네일을 실행하세요.");
      return;
    }
    await runEditStep();
    await waitForEnter(
      "메모장에서 원고를 수정·저장한 뒤,",
      options.batchMode,
    );
    await writePreviewHtml();
  }

  await runThumbnailStep();

  const proceed = await promptContinue(
    "썸네일까지 완료했습니다. 업로드를 진행할까요?",
    options.batchMode,
  );
  if (!proceed) {
    console.log("\n업로드를 건너뜁니다. 나중에 [7] 업로드만 실행하세요.");
    return;
  }

  await runPublishStep();
  console.log("\n✅ AI 자동 모드 전체 실행 완료");
}

/**
 * 단계별 워크플로우 디스패처.
 */
export async function runWorkflow(options: WorkflowRunOptions): Promise<void> {
  const stage = options.step;

  try {
    switch (options.step) {
      case "content":
        await runContentStep(options);
        break;
      case "import":
        await runImportStep(options);
        break;
      case "edit":
        await runEditStep();
        break;
      case "thumbnail":
        await runThumbnailStep();
        break;
      case "thumbnail-preview":
        await runThumbnailPreviewStep();
        break;
      case "publish":
        await runPublishStep();
        break;
      case "full":
        await runFullWorkflow(options);
        break;
      case "import-full":
        await runImportFullWorkflow(options);
        break;
      case "import-resume":
        await runImportResumeStep();
        break;
      case "check-import":
        await runCheckImportStep();
        break;
      default:
        throw new Error(`알 수 없는 단계: ${options.step}`);
    }
  } catch (error) {
    logger.error(
      `[Workflow:${stage}] ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }

    try {
      await notifyError(error, { stage: `workflow:${stage}` });
    } catch (notifyErr) {
      logger.error(
        `Discord 알림 전송 실패: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
      );
    }

    throw error;
  }
}
