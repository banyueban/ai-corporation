import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkProjectStatusStructure(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const errors = [];

  let notStartedHeading;

  for (const [index, line] of lines.entries()) {
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);

    if (heading !== null) {
      const level = heading[1].length;
      const title = heading[2].trim();

      if (
        notStartedHeading !== undefined &&
        level <= notStartedHeading.level
      ) {
        notStartedHeading = undefined;
      }

      if (title.includes("尚未开始")) {
        notStartedHeading = { level, line: index + 1, title };
      }

      continue;
    }

    if (
      notStartedHeading !== undefined &&
      /^\s*-\s*\[[xX]\]\s+/u.test(line)
    ) {
      errors.push(
        `line ${index + 1}: completed item appears under ` +
          `"${notStartedHeading.title}" (line ${notStartedHeading.line})`,
      );
    }
  }

  return errors;
}

function run() {
  const statusPath = resolve("PROJECT_STATUS.md");
  const errors = checkProjectStatusStructure(
    readFileSync(statusPath, "utf8"),
  );

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
