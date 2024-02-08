#!/usr/bin/env -S deno run

import * as c from "./compliance.ts";

const qsGCB = new c.QualitySysComplianceBuilder();
const { builders: qsBuilders } = qsGCB;

await qsBuilders["Outcomes Management"].compliance(async function* (c) {
  yield c.ok("SCF Control ID: SYS.01 - Requirement #1234 completed");
  yield c.ok("SCF Control ID: SYS.02 - Requirement #1235 completed");
  yield c.notOk("SCF Control ID: SYS.03 - Requirement #1236 incomplete", {
    diagnostics: {
      "Audit Note":
        "Pending minor revisions. See comments in Jira ticket ABC-123",
      "Jira Ticket": "ABC-123",
    },
  });
});

await qsBuilders["Design and Development"].compliance(async function* (c) {
  yield c.ok("SCF Control ID: SYS.01 - Requirement #1234 completed");
  yield c.ok("SCF Control ID: SYS.02 - Requirement #1235 completed");
  yield c.notOk("SCF Control ID: SYS.03 - Requirement #1236 incomplete", {
    diagnostics: {
      "Audit Note":
        "Pending minor revisions. See comments in Jira ticket ABC-123",
      "Jira Ticket": "ABC-123",
      "Pull Request": new URL("https://github.com/repo/pull/789")
        .toString(),
    },
  });
});

console.log(
  Deno.args.find((a) => a == "--html")
    ? qsGCB.tapContentHTML()
    : (Deno.args.find((a) => a == "--md")
      ? qsGCB.tapContentMarkdown()
      : (Deno.args.find((a) => a == "--json")
        ? qsGCB.tapContentJSON()
        : qsGCB.tapContentText())),
);
