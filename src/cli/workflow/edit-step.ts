import {
  getWorkspaceDir,
  openDraftEditors,
  workspaceExists,
} from "../draft-workspace.js";

/**
 * 편집 파일을 열고 수동 수정 안내를 출력한다.
 */
export async function runEditStep(): Promise<void> {
  if (!(await workspaceExists())) {
    throw new Error("편집할 원고가 없습니다. 먼저 글 작성을 실행하세요.");
  }

  await openDraftEditors();
  console.log("\n─── 원고 편집 ───");
  console.log(`폴더: ${getWorkspaceDir()}`);
  console.log("메모장에서 수정 후 저장하세요.");
  console.log("미리보기: output/drafts/current/preview.html (필요 시 직접 열기)");
}
