import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const allowedStatuses = new Set([
  "未开始",
  "就绪",
  "进行中",
  "部分完成",
  "阻塞",
  "失败",
  "完成",
]);

const requiredMetadata = [
  "任务单元 ID",
  "状态",
  "所属 Milestone",
  "主要结果",
  "基线提交",
];

const requiredSections = [
  "需求与设计引用",
  "前置条件",
  "包含范围",
  "非范围",
  "依赖与接口",
  "交付物与所有权",
  "验收合同",
  "隔离与干扰控制",
  "证据计划",
  "完成规则",
];

export function checkTaskUnitDocument(markdown, fileName) {
  const errors = [];
  const metadata = new Map();

  for (const match of markdown.matchAll(
    /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gmu,
  )) {
    metadata.set(match[1].trim(), match[2].trim());
  }

  for (const field of requiredMetadata) {
    if (!metadata.has(field)) {
      errors.push(`${fileName}: missing metadata "${field}"`);
    }
  }

  const id = metadata.get("任务单元 ID");
  if (id !== undefined) {
    if (!/^M\d+-TU-\d{2}$/u.test(id)) {
      errors.push(`${fileName}: invalid task unit ID "${id}"`);
    }
    if (basename(fileName, ".md").split("-").slice(0, 3).join("-") !== id) {
      errors.push(
        `${fileName}: file name does not start with task unit ID ${id}`,
      );
    }
    if (!markdown.startsWith(`# ${id} `)) {
      errors.push(`${fileName}: title does not start with "# ${id} "`);
    }

    const milestoneNumber = /^M(\d+)-TU-\d{2}$/u.exec(id)?.[1];
    const milestoneName = metadata.get("所属 Milestone");
    if (
      milestoneNumber !== undefined &&
      milestoneName !== undefined &&
      !new RegExp(`\\bMilestone\\s+${milestoneNumber}\\b`, "u").test(
        milestoneName,
      )
    ) {
      errors.push(
        `${fileName}: task unit ID ${id} does not match "${milestoneName}"`,
      );
    }
  }

  const status = metadata.get("状态");
  if (status !== undefined && !allowedStatuses.has(status)) {
    errors.push(`${fileName}: unsupported status "${status}"`);
  }

  for (const section of requiredSections) {
    if (!new RegExp(`^##\\s+\\d+\\.\\s+${section}\\s*$`, "mu").test(markdown)) {
      errors.push(`${fileName}: missing section "${section}"`);
    }
  }

  const designReferences =
    /^##\s+\d+\.\s+需求与设计引用\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/mu.exec(
      markdown,
    );
  if (
    designReferences === null ||
    !/(?:^|\/)MVP-Plan\.md(?:[)#：:]|$)/mu.test(designReferences[1])
  ) {
    errors.push(
      `${fileName}: requirements and design references must link MVP-Plan.md`,
    );
  } else if (id !== undefined) {
    const milestoneNumber = /^M(\d+)-TU-\d{2}$/u.exec(id)?.[1];
    if (
      milestoneNumber !== undefined &&
      !new RegExp(`\\bMilestone\\s+${milestoneNumber}\\b`, "u").test(
        designReferences[1],
      )
    ) {
      errors.push(
        `${fileName}: MVP Plan reference must identify Milestone ${milestoneNumber}`,
      );
    }
  }

  if (
    status !== undefined &&
    status !== "未开始" &&
    /\bTBD\b|待定|以后补充|实施时再定/iu.test(markdown)
  ) {
    errors.push(
      `${fileName}: ${status} task unit contains unresolved placeholder`,
    );
  }

  const acceptanceMatch =
    /^##\s+\d+\.\s+验收合同\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/mu.exec(markdown);
  if (
    acceptanceMatch === null ||
    !/^\s*-\s*\[[ xX]\]\s+/mu.test(acceptanceMatch[1])
  ) {
    errors.push(`${fileName}: acceptance contract has no checklist`);
  } else if (
    status === "完成" &&
    /^\s*-\s*\[ \]\s+/mu.test(acceptanceMatch[1])
  ) {
    errors.push(
      `${fileName}: completed task unit has unchecked acceptance items`,
    );
  }

  return { errors, id, status };
}

export function checkTaskUnitCollection(documents) {
  const errors = [];
  const seenIds = new Map();

  for (const document of documents) {
    const result = checkTaskUnitDocument(document.markdown, document.fileName);
    errors.push(...result.errors);
    if (result.id === undefined) {
      continue;
    }
    const previous = seenIds.get(result.id);
    if (previous !== undefined) {
      errors.push(
        `${document.fileName}: duplicate task unit ID ${result.id} also used by ${previous}`,
      );
    } else {
      seenIds.set(result.id, document.fileName);
    }
  }

  return errors;
}

export function checkCurrentTaskUnitReference(statusMarkdown, documents) {
  const errors = [];
  const reference =
    /^\|\s*当前任务单元\s*\|\s*(M\d+-TU-\d{2})（(未开始|就绪|进行中|部分完成|阻塞|失败|完成)(?:，[^）]+)?）\s*\|$/mu.exec(
      statusMarkdown,
    );
  if (reference === null) {
    return [
      "PROJECT_STATUS.md: missing current task unit in the form Mx-TU-xx（状态）",
    ];
  }

  const [, referencedId, referencedStatus] = reference;
  const matches = documents
    .map((document) => ({
      document,
      result: checkTaskUnitDocument(document.markdown, document.fileName),
    }))
    .filter(({ result }) => result.id === referencedId);

  if (matches.length === 0) {
    errors.push(
      `PROJECT_STATUS.md: current task unit ${referencedId} has no contract`,
    );
  } else if (matches[0].result.status !== referencedStatus) {
    errors.push(
      `PROJECT_STATUS.md: current task unit status ${referencedStatus} does not match ` +
        `contract status ${matches[0].result.status}`,
    );
  }

  return errors;
}

function run() {
  const directory = resolve("docs/06-engineering/task-units");
  const documents = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({
      fileName: entry.name,
      markdown: readFileSync(resolve(directory, entry.name), "utf8"),
    }));

  const errors = [
    ...checkTaskUnitCollection(documents),
    ...checkCurrentTaskUnitReference(
      readFileSync(resolve("PROJECT_STATUS.md"), "utf8"),
      documents,
    ),
  ];
  if (errors.length > 0) {
    console.error("Task unit contract check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Task unit contract check passed (${documents.length} document)`,
    );
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  run();
}
