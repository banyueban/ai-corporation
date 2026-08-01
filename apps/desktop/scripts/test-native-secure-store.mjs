import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyNativeSecureStoreJourney } from "./native-secure-store-journey.mjs";

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");
const executablePath = path.join(
  repositoryDirectory,
  "target",
  "debug",
  process.platform === "win32" ? "native-core.exe" : "native-core",
);

if (!existsSync(executablePath)) {
  throw new Error("Development Native Core executable does not exist");
}

await verifyNativeSecureStoreJourney(executablePath);
console.log(
  "Development Native secure store verified: status · set · get · rotate · process restart · delete · process restart · not found · cleanup",
);
