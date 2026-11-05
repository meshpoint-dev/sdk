import { describe, expect, it } from "vitest";
import { projectIdFromRemote } from "../src/project.js";

describe("projectIdFromRemote", () => {
  it("maps every clone form of one repo to one id", () => {
    const expected = "github.com--meshpoint-dev--platform";
    expect(projectIdFromRemote("git@github.com:meshpoint-dev/platform.git")).toBe(expected);
    expect(projectIdFromRemote("ssh://git@github.com/meshpoint-dev/platform.git")).toBe(expected);
    expect(projectIdFromRemote("https://github.com/meshpoint-dev/platform")).toBe(expected);
    expect(projectIdFromRemote("https://github.com/Meshpoint-Dev/Platform.git/")).toBe(expected);
    expect(projectIdFromRemote("git://github.com/meshpoint-dev/platform.git")).toBe(expected);
  });

  it("keeps nested group paths and self-hosted ports", () => {
    expect(projectIdFromRemote("https://gitlab.example.com:8443/group/sub/repo.git")).toBe("gitlab.example.com--group--sub--repo");
  });

  it("rejects remotes without owner/repo", () => {
    expect(() => projectIdFromRemote("https://github.com/only")).toThrow(/owner\/repo/);
    expect(() => projectIdFromRemote("not a remote")).toThrow(/unrecognised/);
  });
});
