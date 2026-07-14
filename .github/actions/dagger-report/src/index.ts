import * as core from "@actions/core";

import {
  parseDaggerStdout,
  renderConsoleGroupBody,
  renderConsoleText,
  toConsoleSegments,
} from "./report.js";

function getDaggerStdout(): string {
  return core.getInput("dagger-stdout") || process.env.DAGGER_STDOUT || "";
}

function printReport(markdown: string): void {
  core.info("Dagger pipeline report:");
  for (const segment of toConsoleSegments(markdown)) {
    if (segment.type === "group" && segment.label) {
      core.startGroup(segment.label);
      core.info(renderConsoleGroupBody(segment));
      core.endGroup();
      continue;
    }

    const text = renderConsoleText(segment);
    if (text) {
      core.info(text);
    }
  }
}

async function run(): Promise<void> {
  core.setOutput("report-markdown", "");
  core.setOutput("pipeline-success", "");

  const result = parseDaggerStdout(getDaggerStdout());
  if (!result) {
    return;
  }

  if (result.failClosed) {
    core.setFailed(
      "Raw Dagger stdout indicates success=false, but structured JSON could not be parsed.",
    );
    return;
  }

  if (result.markdown) {
    printReport(result.markdown);
    core.setOutput("report-markdown", result.markdown);
    core.summary.addRaw(`\n${result.markdown}\n`);
    await core.summary.write();
  }

  if (typeof result.successValue === "boolean") {
    core.setOutput("pipeline-success", result.successValue ? "true" : "false");
  }

  if (result.failed) {
    core.setFailed(
      "Structured Dagger output returned success=false or included report errors.",
    );
  }
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
