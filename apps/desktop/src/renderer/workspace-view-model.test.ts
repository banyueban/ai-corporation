import type { WorkspacePublic } from "@ai-corporation/protocols";
import { describe, expect, it } from "vitest";
import {
  presentWorkspace,
  replaceWorkspace,
  workspaceErrorMessage,
} from "./workspace-view-model";

const workspace: WorkspacePublic = {
  workspaceId: "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef",
  displayPath: "E:\\example",
  permissionMode: "READ_WRITE",
  accessStatus: "AVAILABLE",
};

describe("Workspace UI state", () => {
  it("does not present stale permission as current access", () => {
    expect(presentWorkspace({ ...workspace, accessStatus: "MISSING" })).toEqual(
      {
        accessLabel: "Folder missing",
        permissionLabel: "Last verified: read and write",
        recoveryAction: "Restore the folder or select another workspace.",
        tone: "critical",
      },
    );
    expect(
      presentWorkspace({ ...workspace, accessStatus: "UNVERIFIED" }),
    ).toMatchObject({
      accessLabel: "Verification required",
      tone: "warning",
    });
  });

  it("maps fixed errors to actionable messages without echoing data", () => {
    expect(workspaceErrorMessage("VERIFICATION_FAILED")).toContain(
      "existing authorization was not changed",
    );
    expect(workspaceErrorMessage("SELECTION_UNAVAILABLE")).toContain(
      "folder selector",
    );
  });

  it("updates one workspace without disturbing the stable list", () => {
    const second = {
      ...workspace,
      workspaceId: "019fa9bb-375e-7d90-a4e3-a5b0eea2a9f0",
      displayPath: "E:\\second",
    };
    expect(
      replaceWorkspace([workspace, second], {
        ...workspace,
        permissionMode: "READ_ONLY",
      }),
    ).toEqual([{ ...workspace, permissionMode: "READ_ONLY" }, second]);
  });
});
