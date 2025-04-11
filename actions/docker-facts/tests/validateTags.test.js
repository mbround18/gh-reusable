const core = require("@actions/core");
const { __testables } = require("../index");
const { validateTags } = __testables || {};

jest.mock("@actions/core");

describe("validateTags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.warning = jest.fn();
  });

  test("should fix malformed tags with multiple colons", () => {
    if (!validateTags) return;

    const tags = [
      "myimage:v1.0.0",
      "myimage:v1.0:latest",
      "registry.io/myimage:v1.0:feature",
    ];

    const result = validateTags(tags);

    expect(result).toEqual([
      "myimage:v1.0.0",
      "myimage:v1.0",
      "registry.io/myimage:v1.0",
    ]);
    expect(core.warning).toHaveBeenCalledTimes(2);
  });

  test("should leave valid tags unchanged", () => {
    if (!validateTags) return;

    const tags = [
      "myimage:v1.0.0",
      "docker.io/myimage:v1.0.0",
      "ghcr.io/user/myimage:latest",
    ];

    const result = validateTags(tags);

    expect(result).toEqual(tags);
    expect(core.warning).not.toHaveBeenCalled();
  });

  test("should handle tags without colons", () => {
    if (!validateTags) return;

    const tags = ["myimage", "docker.io/myimage"];

    const result = validateTags(tags);

    expect(result).toEqual(tags);
    expect(core.warning).not.toHaveBeenCalled();
  });
});
