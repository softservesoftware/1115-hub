// import * as tap from "../../../netspective-labs/sql-aide/lib/tap/mod.ts";
// export * as tap from "../../../netspective-labs/sql-aide/lib/tap/mod.ts";

import * as tap from "https://raw.githubusercontent.com/netspective-labs/sql-aide/v0.13.8/lib/tap/mod.ts";
export * as tap from "https://raw.githubusercontent.com/netspective-labs/sql-aide/v0.13.8/lib/tap/mod.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export type AuditResults = {
  readonly "Audit Note"?: string;
  readonly "Jira Ticket"?: string;
};

export type AuditSoftwareResults = AuditResults & {
  readonly "Pull Request"?: string;
};

export function qsSubjectArea<
  Area extends string,
  Auditable extends AuditResults,
>(
  area: Area,
  descr: string,
  tcb = new (class extends tap.TapComplianceBuilder<Area, Auditable> {
    constructor() {
      super(false); // don't include a header
    }

    async compliance(
      elems: (
        factory: tap.BodyFactory<Auditable>,
      ) => AsyncGenerator<tap.TestSuiteElement<Auditable>>,
    ) {
      await this.subject(area, elems);
      return this;
    }
  })(),
) {
  return { area, descr, tcb };
}

// Define the constant and let TypeScript infer the type with 'as const' so
// that we can use keyof to get the proper entries in a type-safe manner
export const qualitySystemSubjectAreas = [
  qsSubjectArea(
    "Outcomes Management",
    `Arguably the most important subject area, emphasizing importance of
     determining expected outcomes and objectives of the solution, rather than
     just focusing on technical requirements and specifications. It integrates
     aspects of traditional Requirements Management by ensuring that the
     solution not only meets the technical requirements but also aligns with
     the broader business goals and customer expectations.

     This approach involves a thorough understanding of the end-user needs,
     desired functionality, and the impact the software is expected to have.
     It also entails setting clear, measurable outcomes and ensuring that the
     software development process is geared towards achieving these outcomes,
     thus ensuring a more holistic approach to software development.`,
  ),
  qsSubjectArea<"Design and Development", AuditSoftwareResults>(
    "Design and Development",
    `Covering aspects of software design, architecture, and development
     processes, including adherence to coding standards and effective
     development methodologies.`,
  ),
  qsSubjectArea(
    "Testing and Quality Assurance",
    `Focusing on various forms of testing to identify and rectify bugs and
     defects and ensuring that the software meets quality standards
     throughout its development.`,
  ),
  qsSubjectArea(
    "Configuration Management",
    `Managing changes to software products, including version control and
     tracking of changes.`,
  ),
  qsSubjectArea(
    "Risk Management",
    `Identifying, analyzing, and mitigating risks associated with software
     development.`,
  ),
  qsSubjectArea(
    "Project Management",
    `Ensuring that the software project is delivered on time, within budget,
     and according to the project plan.`,
  ),
  qsSubjectArea(
    "Compliance and Standards Adherence",
    `Ensuring compliance with relevant industry standards and regulations.`,
  ),
  qsSubjectArea(
    "Documentation and Records Management",
    `Keeping accurate records and documentation throughout the software
     development lifecycle.`,
  ),
] as const;

export type QualitySysComplianceSubjectArea =
  typeof qualitySystemSubjectAreas[number]["area"];

export type QualitySysComplianceBuilderType = {
  [K in QualitySysComplianceSubjectArea]: Extract<
    typeof qualitySystemSubjectAreas[number],
    { area: K }
  >["tcb"];
};

export class QualitySysComplianceBuilder {
  readonly builders: QualitySysComplianceBuilderType;

  constructor() {
    this.builders = {} as QualitySysComplianceBuilderType;
    for (const sa of qualitySystemSubjectAreas) {
      // coersion required because areas are dynamic but we force type-safety
      (this.builders[sa.area] as Any) = sa.tcb;
    }
  }

  tapContent() {
    const tcb = new tap.TapComplianceBuilder();
    for (const sa of qualitySystemSubjectAreas) {
      tcb.contentBuilder.bb.content.push(
        ...sa.tcb.contentBuilder.bb.content.filter((c) =>
          c.nature === "test-case"
        ),
      );
    }
    return tcb.tapContent();
  }

  tapContentText() {
    return tap.stringify(this.tapContent());
  }

  tapContentHTML() {
    return tapContentHTML(this.tapContent());
  }
}

export function sowPhase1TaskDescr<Task extends string>(task: Task) {
  return { task };
}

// deno-fmt-ignore
export const sowPhase1Tasks = [
  sowPhase1TaskDescr("Signed SOW"),
  sowPhase1TaskDescr("Setting up secure transfer capabilities from the screening  contributor to the QE"),
  sowPhase1TaskDescr("QE management of user credentials and permissions, ensuring that only authorized users can access the SFTP server for file transfers."),
  sowPhase1TaskDescr("Files received via SFTP must be securely stored with appropriate access controls in place to maintain data integrity and confidentiality."),
  sowPhase1TaskDescr("All received files must be encrypted during transmission to and from the SFTP server. Encryption standards and protocols should be in compliance with jointly-agreed security measures."),
  sowPhase1TaskDescr("Upon successful file receipt, QEs are required to automatically forward these files to Data Quality Evaluation at their own QE or at QCS. Timing will be determined in collaboration with the QEs and decided by QCS and NYeC."),
  sowPhase1TaskDescr("Each Qualified Entity (QE) is required to submit a thorough test plan designed to validate the successful implementation of the SFTP objectives and execute this test plan. QEs are strongly encouraged to collaborate in the development of their test plans. NYeC must approve each QEs test plan, and it is encouraged for multiple QEs to utilize a shared document for this purpose.")
] as const;

export type SowPhase1Task = typeof sowPhase1Tasks[number]["task"];

// subclass BodyFactory to make task-names (in `ok` and `notOk` type-safe)
export class SowPhase1BodyFactory<Diagnosable extends tap.Diagnostics> {
  readonly bb = new tap.BodyBuilder<Diagnosable>();
  readonly bf = new tap.BodyFactory<Diagnosable>(() =>
    new tap.BodyBuilder<Diagnosable>()
  );

  ok(description: SowPhase1Task, args?: tap.TestCaseBuilderArgs<Diagnosable>) {
    return this.bf.ok(description, args);
  }

  notOk(
    description: SowPhase1Task,
    args?: tap.TestCaseBuilderArgs<Diagnosable>,
  ) {
    return this.bf.notOk(description, args);
  }

  async compliance(
    elems: (
      factory: SowPhase1BodyFactory<Diagnosable>,
    ) => AsyncGenerator<tap.TestSuiteElement<Diagnosable>>,
  ) {
    const yielded = await Array.fromAsync(elems(this));
    for (const ey of yielded) {
      this.bb.content.push(ey);
    }
  }
}

export class SowComplianceBuilder<Diagnosable extends tap.Diagnostics> {
  readonly phase1 = new SowPhase1BodyFactory<Diagnosable>();

  constructor() {
  }

  tapContent() {
    const tcb = new tap.TapComplianceBuilder(false);
    tcb.contentBuilder.bb.content.push(
      ...this.phase1.bb.content.filter((c) => c.nature === "test-case"),
    );
    return tcb.tapContent();
  }

  tapContentText() {
    return tap.stringify(this.tapContent());
  }

  tapContentHTML() {
    return tapContentHTML(this.tapContent());
  }
}

interface TapContentHTMLOptions {
  css?: () => string;
  diagnosticsTable?: (diagnostics: tap.Diagnostics) => string;
}

function tapContentHTML<Diagnosable extends tap.Diagnostics>(
  tapContent: tap.TapContent<Diagnosable>,
  options?: TapContentHTMLOptions,
): string {
  // Enhanced CSS styling for improved visual appearance and indentation
  const defaultCSS = (): string => `
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f0f0f0; color: #333; }
    details { margin-bottom: 5px; border-left: 3px solid #ccc; padding-left: 15px; }
    details > summary { cursor: pointer; font-weight: bold; margin-bottom: 5px; }
    details > summary > strong { color: #0056b3; }
    .test-case { padding: 10px 0; }
    .ok { color: #28a745; }
    .not-ok { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; background-color: white; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    footer { margin-top: 20px; color: #777; }
    .comment { font-style: italic; color: #6c757d; }
  `;

  // Default diagnostics table function
  const defaultDiagnosticsTable = (diagnostics: tap.Diagnostics): string => {
    let tableHtml = "<table><tr><th>Key</th><th>Value</th></tr>";
    for (const [key, value] of Object.entries(diagnostics)) {
      tableHtml += `<tr><td>${key}</td><td>${
        typeof value === "object" ? JSON.stringify(value, null, 2) : value
      }</td></tr>`;
    }
    tableHtml += "</table>";
    return tableHtml;
  };

  // Use provided CSS and diagnosticsTable function if available, or default
  const css = options?.css ? options.css() : defaultCSS();
  const diagnosticsTable = options?.diagnosticsTable
    ? options.diagnosticsTable
    : defaultDiagnosticsTable;

  // Setup HTML document with dynamic CSS
  let html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>TAP Test Results</title><style>${css}</style></head><body>`;

  // Version and Plan processing, unchanged from previous versions
  if (tapContent.version) {
    html += `<p>Version: ${tapContent.version.version}</p>`;
  }

  // Recursive function to process test elements, including nested subtests
  html += processTestElements(tapContent.body);

  // Footers
  for (const footer of tapContent.footers) {
    html += `<footer>${footer.content}</footer>`;
  }

  // Close HTML document
  html += "</body></html>";
  return html;

  // Inner function for processing test elements, including subtests
  function processTestElements(
    body: Iterable<tap.TestSuiteElement<Diagnosable>>,
    level = 0,
  ): string {
    let contentHtml = "";
    for (const element of body) {
      if (element.nature === "test-case") {
        const test = element as tap.TestCase<Diagnosable>;
        const statusEmoji = test.ok
          ? '<span class="ok">✅</span>'
          : '<span class="not-ok">❌</span>';
        contentHtml +=
          `<details><summary>${statusEmoji} <strong>${test.description}</strong></summary><div class="test-case">`;

        if (test.directive) {
          contentHtml +=
            `<p><em>[${test.directive.nature}: ${test.directive.reason}]</em></p>`;
        }

        if (test.diagnostics) {
          contentHtml += `<div>${diagnosticsTable(test.diagnostics)}</div>`;
        }

        if (test.subtests) {
          contentHtml += processTestElements(test.subtests.body, level + 1);
        }

        contentHtml += `</div></details>`;
      } else if (element.nature === "comment") {
        const comment = element as tap.CommentNode;
        contentHtml += `<div class="comment">Comment: ${comment.content}</div>`;
      }
    }
    return contentHtml;
  }
}
