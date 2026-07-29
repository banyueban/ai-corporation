import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkProjectStatusStructure(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const errors = [];
  const requiredMilestoneItems = new Map([
    [0, "Windows/macOS 打包产物启动与 Rust health E2E"],
  ]);

  let notStartedHeading;
  let implementationSection;
  let currentMilestone;
  let completedMilestone;

  for (const [index, line] of lines.entries()) {
    const currentMilestoneMatch =
      /^\|\s*当前 Milestone\s*\|.*Milestone\s+(\d+)/u.exec(line);
    if (currentMilestoneMatch !== null) {
      currentMilestone = Number.parseInt(currentMilestoneMatch[1], 10);
    }
    const completedMilestoneMatch =
      /^\|\s*当前阶段\s*\|.*Milestone\s+(\d+)\s+已完成/u.exec(line);
    if (completedMilestoneMatch !== null) {
      completedMilestone = Number.parseInt(completedMilestoneMatch[1], 10);
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);

    if (heading !== null) {
      const level = heading[1].length;
      const title = heading[2].trim();

      if (
        /^\d{4}-\d{2}-\d{2}(?:\s|：|:)/u.test(title) ||
        /(?:历史记录|变更时间线|验证时间线)/u.test(title)
      ) {
        errors.push(
          `line ${index + 1}: PROJECT_STATUS.md must contain only current facts; ` +
            `history belongs in Git/CI, not heading "${title}"`,
        );
      }

      if (notStartedHeading !== undefined && level <= notStartedHeading.level) {
        notStartedHeading = undefined;
      }

      if (title.includes("尚未开始")) {
        notStartedHeading = { level, line: index + 1, title };
      }

      if (
        implementationSection !== undefined &&
        level <= implementationSection.level
      ) {
        implementationSection = undefined;
      }
      const implementationMatch = /Milestone\s+(\d+).*实施状态/u.exec(title);
      if (implementationMatch !== null) {
        implementationSection = {
          checklist: [],
          level,
          milestone: Number.parseInt(implementationMatch[1], 10),
        };
      }

      continue;
    }

    if (notStartedHeading !== undefined && /^\s*-\s*\[[xX]\]\s+/u.test(line)) {
      errors.push(
        `line ${index + 1}: completed item appears under ` +
          `"${notStartedHeading.title}" (line ${notStartedHeading.line})`,
      );
    }

    const checklistMatch = /^\s*-\s*\[([ xX])\]\s+(.+)$/u.exec(line);
    if (implementationSection !== undefined && checklistMatch !== null) {
      implementationSection.checklist.push({
        completed: checklistMatch[1].toLowerCase() === "x",
        text: checklistMatch[2],
      });
    }
  }

  const milestoneSectionMatch =
    /##\s+\d+\.\s+Milestone\s+(\d+)\s+实施状态([\s\S]*?)(?=\n##\s|\s*$)/u.exec(
      markdown,
    );
  if (milestoneSectionMatch !== null) {
    const milestone = Number.parseInt(milestoneSectionMatch[1], 10);
    const checklist = [
      ...milestoneSectionMatch[2].matchAll(/^\s*-\s*\[([ xX])\]\s+(.+)$/gmu),
    ].map((match) => ({
      completed: match[1].toLowerCase() === "x",
      text: match[2],
    }));
    const requiredItem = requiredMilestoneItems.get(milestone);
    if (
      requiredItem !== undefined &&
      !checklist.some((item) => item.text.includes(requiredItem))
    ) {
      errors.push(
        `Milestone ${milestone} status is missing required item "${requiredItem}"`,
      );
    }
    const incompleteItems = checklist.filter((item) => !item.completed);
    if (
      incompleteItems.length > 0 &&
      (completedMilestone === milestone ||
        (currentMilestone !== undefined && currentMilestone > milestone))
    ) {
      errors.push(
        `Milestone ${milestone} cannot be closed or advanced with incomplete items: ` +
          incompleteItems.map((item) => item.text).join(", "),
      );
    }
  }

  return errors;
}

function run() {
  const statusPath = resolve("PROJECT_STATUS.md");
  const errors = checkProjectStatusStructure(readFileSync(statusPath, "utf8"));

  if (errors.length > 0) {
    console.error("PROJECT_STATUS.md structure check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log("PROJECT_STATUS.md structure check passed");
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  run();
}
