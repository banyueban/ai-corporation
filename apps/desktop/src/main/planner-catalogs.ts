export const PLANNER_CATALOGS = {
  schemaVersion: "1.0",
  capabilityPaths: [
    "analysis.requirements",
    "writing.document",
    "software.implementation",
    "quality.validation",
    "human.decision",
  ],
  tools: [
    "workspace.read_text",
    "workspace.propose_write",
    "process.run_profile",
  ],
  mediaTypes: [
    "text/plain",
    "text/markdown",
    "application/json",
    "application/octet-stream",
  ],
  processProfiles: [],
} as const;

export type PlannerCatalogs = typeof PLANNER_CATALOGS;
