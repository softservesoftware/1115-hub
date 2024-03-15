import {
  array,
  chainNB,
  dax,
  fs,
  path,
  safety,
  SQLa_orch as o,
  SQLa_orch_duckdb as ddbo,
  uuid,
  ws,
  yaml,
} from "./deps.ts";
import * as sp from "./sqlpage.ts";
import * as ref from "./reference.ts";
import * as csv from "./csv.ts";
import * as excel from "./excel.ts";

export const ORCHESTRATE_VERSION = "0.8.2";

export type PotentialIngestSource =
  | excel.ScreeningExcelSheetIngestSource<string, o.State>
  | excel.AdminDemographicExcelSheetIngestSource<string, o.State>
  | excel.QeAdminDataExcelSheetIngestSource<string, o.State>
  | excel.QuestionReferenceExcelSheetIngestSource<string, o.State>
  | excel.AnswerReferenceExcelSheetIngestSource<string, o.State>
  | excel.ExcelSheetTodoIngestSource<string, o.State>
  | csv.ScreeningCsvFileIngestSource<string, o.State>
  | csv.AdminDemographicCsvFileIngestSource<string, o.State>
  | ref.AhcCrossWalkCsvFileIngestSource<"ahc_cross_walk", o.State>
  | ref.EncounterTypeCodeReferenceCsvFileIngestSource<
    "encounter_type_code_reference",
    o.State
  >
  | ref.EncounterClassReferenceCsvFileIngestSource<
    "encounter_class_reference",
    o.State
  >
  | ref.EncounterStatusCodeReferenceCsvFileIngestSource<
    "encounter_status_code_reference",
    o.State
  >
  | ref.ScreeningStatusCodeReferenceCsvFileIngestSource<
    "screening_status_code_reference",
    o.State
  >
  | ref.GenderIdentityReferenceCsvFileIngestSource<
    "gender_identity_reference",
    o.State
  >
  | ref.AdministrativeSexReferenceCsvFileIngestSource<
    "administrative_sex_reference",
    o.State
  >
  | ref.SexAtBirthReferenceCsvFileIngestSource<
    "sex_at_birth_reference",
    o.State
  >
  | ref.SexualOrientationReferenceCsvFileIngestSource<
    "sexual_orientation_reference",
    o.State
  >
  | ref.BusinessRulesReferenceCsvFileIngestSource<
    "business_rules",
    o.State
  >
  | ref.RaceReferenceCsvFileIngestSource<
    "race_reference",
    o.State
  >
  | ref.EthnicityReferenceCsvFileIngestSource<
    "ethnicity_reference",
    o.State
  >
  | ref.PreferredLanguageReferenceCsvFileIngestSource<
    "preferred_language_reference",
    o.State
  >
  | csv.QeAdminDataCsvFileIngestSource<string, o.State>
  | o.ErrorIngestSource<
    ddbo.DuckDbOrchGovernance,
    o.State,
    ddbo.DuckDbOrchEmitContext
  >;

export function walkFsPatternIngestSourcesSupplier(
  govn: ddbo.DuckDbOrchGovernance,
): o.IngestSourcesSupplier<PotentialIngestSource, [string[] | undefined]> {
  return {
    sources: async (suggestedRootPaths?: string[]) => {
      const sources: PotentialIngestSource[] = [];
      const iss = [
        csv.ingestCsvFilesSourcesSupplier(govn),
        excel.ingestExcelSourcesSupplier(govn),
      ];
      const rootPaths = suggestedRootPaths ?? [Deno.cwd()];

      // loop through all the root paths and find patterns such as **/*.csv,
      // **/*.xlsx, etc. supplied in the `iss` array. For each file that
      // matches, obtain the source and put it into the result
      for (const rp of rootPaths) {
        for await (const entry of fs.walk(rp)) {
          if (entry.isFile) {
            for (const p of iss.filter((p) => p.pattern.test(entry.path))) {
              for (const s of await p.sources(entry)) {
                sources.push(s);
              }
            }
          }
        }
      }

      return sources;
    },
  };
}

export type ScreeningIngressGroup = {
  readonly groupID: string;
  readonly component: string;
  readonly entries: o.IngressEntry<string, string>[];
  readonly onIngress: (group: ScreeningIngressGroup) => Promise<void> | void;
};

export const isScreeningIngressGroup = safety.typeGuard<ScreeningIngressGroup>(
  "groupID",
  "component",
);

export class ScreeningIngressGroups {
  // entries are like `screening-<groupID>_admin.csv`, `screening-<groupID>_questions.csv`, etc.
  readonly pattern = /.*(screening)-([^_])_(.*)?.csv/i;
  readonly groups = new Map<string, ScreeningIngressGroup>();

  constructor(readonly onIngress: ScreeningIngressGroup["onIngress"]) {
  }

  potential(
    entry: o.IngressEntry<string, string>,
    onIngress?: ScreeningIngressGroup["onIngress"],
  ) {
    const groupMatch = entry.fsPath.match(this.pattern);
    if (groupMatch) {
      const [, _screening, groupID, component] = groupMatch;
      let group = this.groups.get(groupID);
      if (!group) {
        group = {
          groupID,
          component,
          entries: [entry],
          onIngress: onIngress ?? this.onIngress,
        };
        this.groups.set(groupID, group);
      } else {
        group.entries.push(entry);
      }
      if (group.entries.length == 3) {
        group.onIngress(group);
      }
    }
    return undefined;
  }
}

export function watchFsPatternIngestSourcesSupplier(
  govn: ddbo.DuckDbOrchGovernance,
  src: ScreeningIngressGroup | o.IngressEntry<string, string> | o.IngressEntry<
    string,
    string
  >[],
): o.IngestSourcesSupplier<PotentialIngestSource, [string[] | undefined]> {
  return {
    sources: async () => {
      const sources: PotentialIngestSource[] = [];
      const iss = [
        csv.ingestCsvFilesSourcesSupplier(govn),
        excel.ingestExcelSourcesSupplier(govn),
      ];

      const collect = async (path: string | URL) => {
        for (const p of iss.filter((p) => p.pattern.test(String(path)))) {
          for (const s of await p.sources({ path })) {
            sources.push(s);
          }
        }
      };

      if (isScreeningIngressGroup(src)) {
        src.entries.forEach(async (entry) => await collect(entry.fsPath));
      } else {
        if (Array.isArray(src)) {
          src.forEach(async (entry) => await collect(entry.fsPath));
        } else {
          await collect(src.fsPath);
        }
      }

      return sources;
    },
  };
}

export type OrchStep = chainNB.NotebookCell<
  OrchEngine,
  chainNB.NotebookCellID<OrchEngine>
>;
export type OrchStepContext = chainNB.NotebookCellContext<OrchEngine, OrchStep>;
export const oeDescr = new chainNB.NotebookDescriptor<OrchEngine, OrchStep>();

export type OrchEnginePath =
  & { readonly home: string }
  & o.OrchPathSupplier
  & o.OrchPathMutator;

export type OrchEngineStorablePath = OrchEnginePath & o.OrchPathStore;

export interface OrchEngineIngressPaths {
  readonly ingress: OrchEnginePath;
  readonly initializePaths?: () => Promise<void>;
  readonly finalizePaths?: () => Promise<void>;
}

export interface OrchEngineWorkflowPaths {
  readonly ingressArchive?: OrchEngineStorablePath;
  readonly inProcess: OrchEngineStorablePath & {
    readonly duckDbFsPathSupplier: () => string;
  };
  readonly egress: OrchEngineStorablePath & {
    readonly resourceDbSupplier?: () => string;
    readonly diagsJsonSupplier?: () => string;
    readonly diagsXlsxSupplier?: () => string;
    readonly diagsMdSupplier?: () => string;
    readonly fhirJsonSupplier?: () => string;
    readonly fhirTempJsonSupplier?: () => string;
    readonly fhirHttpSupplier?: () => string;
  };

  readonly initializePaths?: () => Promise<void>;
  readonly finalizePaths?: () => Promise<void>;
}

export function orchEngineIngressPaths(
  home: string,
  init?: Partial<OrchEngineIngressPaths>,
): OrchEngineIngressPaths {
  const ingress = (): OrchEnginePath => {
    const resolvedPath = (child: string) => path.join(home, child);

    return {
      home,
      resolvedPath,
      movedPath: async (path, dest) => {
        const movedToPath = dest.resolvedPath(path);
        await Deno.rename(path, movedToPath);
        return movedToPath;
      },
    };
  };

  return { ingress: ingress(), ...init };
}

export function orchEngineWorkflowPaths(
  rootPath: string,
  sessionID: string,
): OrchEngineWorkflowPaths {
  const oePath = (childPath: string): OrchEnginePath => {
    const home = path.join(rootPath, childPath);
    const resolvedPath = (child: string) => path.join(home, child);

    return {
      home,
      resolvedPath,
      movedPath: async (path, dest) => {
        const movedToPath = dest.resolvedPath(path);
        await Deno.rename(path, movedToPath);
        return movedToPath;
      },
    };
  };

  const oeStorablePath = (childPath: string): OrchEngineStorablePath => {
    const oep = oePath(childPath);
    return {
      ...oep,
      storedContent: async (path, content) => {
        const dest = oep.resolvedPath(path);
        await Deno.writeTextFile(dest, content);
        return dest;
      },
    };
  };

  const egress: OrchEngineWorkflowPaths["egress"] = {
    ...oeStorablePath(path.join("egress", sessionID)),
    diagsJsonSupplier: () => egress.resolvedPath("diagnostics.json"),
    diagsMdSupplier: () => egress.resolvedPath("diagnostics.md"),
    diagsXlsxSupplier: () => egress.resolvedPath("diagnostics.xlsx"),
    resourceDbSupplier: () => egress.resolvedPath("resource.sqlite.db"),
    fhirJsonSupplier: () => egress.resolvedPath("fhir.json"),
    fhirTempJsonSupplier: () => egress.resolvedPath("temp-fhir.json"),
    fhirHttpSupplier: () => egress.resolvedPath("fhir.http"),
  };
  const inProcess: OrchEngineWorkflowPaths["inProcess"] = {
    ...oeStorablePath(path.join("egress", sessionID, ".workflow")),
    duckDbFsPathSupplier: () =>
      inProcess.resolvedPath("ingestion-center.duckdb"),
  };
  const ingressArchive: OrchEngineWorkflowPaths["ingressArchive"] =
    oeStorablePath(path.join("egress", sessionID, ".consumed"));

  return {
    ingressArchive,
    inProcess,
    egress,

    initializePaths: async () => {
      await Deno.mkdir(ingressArchive.home, { recursive: true });
      await Deno.mkdir(inProcess.home, { recursive: true });
      await Deno.mkdir(egress.home, { recursive: true });
    },
  };
}

export interface OrchEngineArgs extends
  o.OrchArgs<
    ddbo.DuckDbOrchGovernance,
    OrchEngine,
    ddbo.DuckDbOrchEmitContext
  > {
  readonly workflowPaths: OrchEngineWorkflowPaths;
  readonly walkRootPaths?: string[];
  readonly referenceDataHome?: string;
}

/**
 * Use OrchEngine to prepare SQL for orchestration steps and execute them
 * using DuckDB CLI engine. Each method that does not have a @ieDescr.disregard()
 * attribute is considered a "step" and each step is executed in the order it is
 * declared. As each step is executed, its error or results are passed to the
 * next method.
 *
 * This Engine assumes that the Kernel observer will abort on Errors. If you want
 * to continue after an error, throw a OrchResumableError and use the second
 * cell argument (result) to test for it.
 *
 * This class is introspected and run using SQLa's Notebook infrastructure.
 * See: https://github.com/netspective-labs/sql-aide/tree/main/lib/notebook
 */
export class OrchEngine {
  protected potentialSources?: PotentialIngestSource[];
  protected ingestables?: {
    readonly psIndex: number; // the index in #potentialSources
    readonly source: PotentialIngestSource;
    readonly workflow: Awaited<ReturnType<PotentialIngestSource["workflow"]>>;
    readonly sessionEntryID: string;
    readonly sql: string;
    readonly issues: {
      readonly session_entry_id: string;
      readonly orch_session_issue_id: string;
      readonly issue_type: string;
      readonly issue_message: string;
      readonly invalid_value: string;
    }[];
  }[];
  readonly duckdb: ddbo.DuckDbShell;
  readonly sqlPageNB: ReturnType<typeof sp.SQLPageNotebook.create>;

  constructor(
    readonly iss: o.IngestSourcesSupplier<
      PotentialIngestSource,
      [string[] | undefined] // optional root paths
    >,
    readonly govn: ddbo.DuckDbOrchGovernance,
    readonly args: OrchEngineArgs,
  ) {
    this.duckdb = new ddbo.DuckDbShell(args.session, {
      duckdbCmd: "duckdb",
      dbDestFsPathSupplier: args.workflowPaths.inProcess.duckDbFsPathSupplier,
      preambleSQL: () =>
        `-- preambleSQL\nSET autoinstall_known_extensions=true;\nSET autoload_known_extensions=true;\n-- end preambleSQL\n`,
    });
    this.sqlPageNB = sp.SQLPageNotebook.create(this.govn);
  }

  /**
   * Prepare the DuckDB path/database for initialization. Typically this gives
   * a chance for the path to the database to be created or removing the existing
   * database in case we want to initialize from scratch.
   * @param osc the type-safe notebook cell context for diagnostics or business rules
   */
  async prepareInit(_osc: OrchStepContext) {
    await this.args.workflowPaths.initializePaths?.();
  }

  /**
   * Initialize the DuckDB database by ensuring the admin tables such as tracking
   * orchestration events (states), activities (which files are being loaded), ingest
   * issues (errors, etc.), and related  entities are created. If there are any
   * errors during this process all other processing should stop and no other steps
   * are executed.
   * @param osc the type-safe notebook cell context for diagnostics or business rules
   */
  async init(osc: OrchStepContext) {
    const {
      govn,
      govn: { informationSchema: is },
      args: {
        session,
      },
    } = this;
    const beforeInit = Array.from(
      session.sqlCatalogSqlSuppliers("before-init"),
    );
    const afterInit = Array.from(session.sqlCatalogSqlSuppliers("after-init"));

    const initDDL = govn.SQL`
      ${beforeInit.length > 0 ? beforeInit : "-- no before-init SQL found"}
      ${is.adminTables}
      ${is.adminTableIndexes}

      ${session.diagnosticsView()}

      -- register the current device and session and use the identifiers for all logging
      ${await session.deviceSqlDML()}
      ${await session.orchSessionSqlDML()}

      -- Load Reference data from csvs

      ${afterInit.length > 0 ? afterInit : "-- no after-init SQL found"}`.SQL(
      this.govn.emitCtx,
    );

    const execResult = await this.duckdb.execute(initDDL, osc.current.nbCellID);
    if (execResult.status.code != 0) {
      const diagsTmpFile = await this.duckdb.writeDiagnosticsSqlMD(
        {
          exec_code: String(execResult.status.code),
          sql: initDDL,
          exec_identity: `initDDL`,
        },
        execResult.status,
      );
      // the kernel stops processing if it's not a OrchResumableError instance
      throw new Error(
        `duckdb.execute status in ${osc.current.nbCellID}() did not return zero, see ${diagsTmpFile}`,
      );
    }
  }

  /**
   * Walk the root paths, find all types of files we can handle, generate
   * ingestion SQL ("loading" part of ELT/ETL) and execute the SQL in a single
   * DuckDB call. Then, for each successful execution (any ingestions that do
   * not create issues in the issue table) prepare the list of subsequent steps
   * for further cleansing, validation, transformations, etc.
   *
   * The reason why we separate initial ingestion and structural validation from
   * content validation, cleansing, and transformations is because content
   * SQL relies on table names and table column names in CTEs and other SQL
   * which must exist otherwise they cause syntax errors. Once we validate the
   * structure and columns of ingested data, then the remainder of the SQL for
   * cleansing, validation, or transformations will not cause syntax errors.
   *
   * @param osc the type-safe notebook cell context for diagnostics or business rules
   * @returns list of "assurables" that did not generate any ingestion issues
   */
  async ingest(osc: OrchStepContext) {
    const {
      govn,
      govn: { emitCtx: ctx },
      args: {
        session,
        referenceDataHome =
          "https://raw.githubusercontent.com/qe-collaborative-services/1115-hub/main/src/ahc-hrsn-elt/reference-data",
      },
    } = this;
    const { sessionID } = session;

    let psIndex = 0;
    this.potentialSources = Array.from(
      await this.iss.sources(this.args.walkRootPaths),
    );

    const referenceIngestSources = [
      new ref.AhcCrossWalkCsvFileIngestSource(referenceDataHome, govn),
      new ref.EncounterClassReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.EncounterStatusCodeReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.EncounterTypeCodeReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.ScreeningStatusCodeReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.GenderIdentityReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.AdministrativeSexReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.SexAtBirthReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.SexualOrientationReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.BusinessRulesReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.RaceReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.EthnicityReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
      new ref.PreferredLanguageReferenceCsvFileIngestSource(
        referenceDataHome,
        govn,
      ),
    ];

    this.potentialSources.push(...referenceIngestSources);

    this.ingestables = [];
    for (const ps of this.potentialSources) {
      const { uri, tableName } = ps;

      const sessionEntryID = await govn.emitCtx.newUUID(govn.deterministicPKs);
      const workflow = await ps.workflow(session, sessionEntryID);
      const checkStruct = await workflow.ingestSQL({
        initState: () => "ENTER(ingest)",
        sessionEntryInsertDML: () => {
          return govn.orchSessionEntryCRF.insertDML({
            orch_session_entry_id: sessionEntryID,
            session_id: sessionID,
            ingest_src: uri,
            ingest_table_name: tableName,
          });
        },
        issueInsertDML: async (message, type = "Structural") => {
          return govn.orchSessionIssueCRF.insertDML({
            orch_session_issue_id: await govn.emitCtx.newUUID(
              govn.deterministicPKs,
            ),
            session_id: sessionID,
            session_entry_id: sessionEntryID,
            issue_type: type,
            issue_message: message,
            invalid_value: uri,
          });
        },
      });

      this.ingestables.push({
        psIndex,
        sessionEntryID,
        sql: `-- ${osc.current.nbCellID} ${uri} (${tableName})\n` +
          checkStruct.SQL(ctx),
        source: ps,
        workflow,
        issues: [],
      });
      psIndex++;
    }

    // run the SQL and then emit the errors to STDOUT in JSON
    const ingestSQL = this.ingestables.map((ic) => ic.sql);
    ingestSQL.push(
      `SELECT session_entry_id, orch_session_issue_id, issue_type, issue_message, invalid_value FROM orch_session_issue WHERE session_id = '${sessionID}'`,
    );
    const ingestResult = await this.duckdb.jsonResult<
      (typeof this.ingestables)[number]["issues"][number]
    >(ingestSQL.join("\n"), osc.current.nbCellID);
    if (ingestResult.json) {
      // if errors were found, put the problems into the proper ingestable issues
      for (const row of ingestResult.json) {
        const ingestable = this.ingestables.find(
          (i) => i.sessionEntryID == row.session_entry_id,
        );
        if (ingestable) ingestable.issues.push(row);
      }
    }

    // for the next step (ensureContent) we only want to pursue remainder of
    // ingestion for those ingestables that didn't have errors during construction
    return this.ingestables.filter((i) => i.issues.length == 0);
  }

  /**
   * For all ingestions from the previous step that did not create any issues
   * (meaning they were successfully ingested), prepare all cleansing,
   * validation, transformation and other SQL and then execute entire SQL as a
   * single DuckDB instance call.
   *
   * The content SQL is separated from structural SQL to avoid syntax errors
   * when a table or table column does not exist (which can happen if the format
   * or structure of an ingested CSV, Excel, Parquet, or other source does not
   * match our expectations).
   *
   * @param osc the type-safe notebook cell context for diagnostics or business rules
   * @param ingestResult the list of successful ingestions from the previous step
   */
  async ensureContent(
    osc: OrchStepContext,
    ingestResult: Awaited<ReturnType<typeof OrchEngine.prototype.ingest>>,
  ) {
    const {
      govn: { emitCtx: ctx },
    } = this;

    // any ingestions that did not produce structural errors will have SQL
    const assurableSQL = await Promise.all(
      ingestResult.map(async (sr) =>
        (await sr.workflow.assuranceSQL()).SQL(ctx)
      ),
    );

    await this.duckdb.execute(assurableSQL.join("\n"), osc.current.nbCellID);
    return ingestResult;
  }

  async emitResources(
    isc: OrchStepContext,
    ensureResult: Awaited<
      ReturnType<typeof OrchEngine.prototype.ensureContent>
    >,
  ) {
    const {
      args: { workflowPaths: { egress }, session },
      govn: { emitCtx: ctx },
    } = this;
    if (egress.resourceDbSupplier) {
      const resourceDb = egress.resourceDbSupplier();
      try {
        Deno.removeSync(resourceDb);
      } catch (_err) {
        // ignore errors if file does not exist
      }

      const adminTables = [
        this.govn.device,
        this.govn.orchSession,
        this.govn.orchSessionEntry,
        this.govn.orchSessionState,
        this.govn.orchSessionExec,
        this.govn.orchSessionIssue,
        this.sqlPageNB.table,
      ];

      const beforeFinalize = session.sqlCatalogSqlText("before-finalize");
      const afterFinalize = session.sqlCatalogSqlText("after-finalize");
      const rdbSchemaName = "resource_db";

      const exportsSQL = await Promise.all(
        ensureResult.map(async (sr) =>
          (await sr.workflow.exportResourceSQL(rdbSchemaName)).SQL(ctx)
        ),
      );

      // `beforeFinalize` SQL includes state management SQL that log all the
      // state changes between this notebooks' cells; however, the "exit" state
      // for this method will not be stored since this is the last step in the
      // process and the exit state will not be encountered before writing to
      // the database.

      // Everything with the `diagnostics-md-ignore-start` and `*-finish` will be
      // executed by the orchestration engine but the SQL won't be store in the
      // diagnostics log because it's noisy and mostly infrastructure.

      const sqlPageCells = await this.sqlPageNB.sqlCells();
      await this.duckdb.execute(
        // deno-fmt-ignore
        this.govn.SQL`
          ${beforeFinalize.length > 0 ? (beforeFinalize.join(";\n") + ";") : "-- no before-finalize SQL provided"}

          -- diagnostics-md-ignore-start "SQLPage and execution diagnostics SQL DML"
          -- emit all the SQLPage content
          ${sqlPageCells};

          -- emit all the execution diagnostics
          ${this.duckdb.diagnostics};
          -- diagnostics-md-ignore-finish "SQLPage and execution diagnostics SQL DML"

          CREATE VIEW orch_session_issue_classification AS
          WITH cte_business_rule AS (
            SELECT worksheet as worksheet,
                field as field,
                required as required,
                "Resolved by QE/QCS" as resolved_by_qe_qcs,
                CONCAT(
                    CASE WHEN UPPER("True Rejection") = 'YES' THEN 'REJECTION' ELSE '' END,
                    CASE WHEN UPPER("Warning Layer") = 'YES' THEN 'WARNING' ELSE '' END
                ) AS record_action
            FROM
                "ingestion-center".main.business_rules
          )
          --select * from cte_business_rule

          SELECT
            -- Including all other columns from 'orch_session'
            ises.* EXCLUDE (orch_started_at, orch_finished_at),
            -- TODO: Casting known timestamp columns to text so emit to Excel works with GDAL (spatial)
              -- strftime(timestamptz orch_started_at, '%Y-%m-%d %H:%M:%S') AS orch_started_at,
              -- strftime(timestamptz orch_finished_at, '%Y-%m-%d %H:%M:%S') AS orch_finished_at,
            -- Including all columns from 'orch_session_entry'
            isee.* EXCLUDE (session_id),
            -- Including all other columns from 'orch_session_issue'
            isi.* EXCLUDE (session_id, session_entry_id),
            br.record_action AS disposition,
            case when UPPER(br.resolved_by_qe_qcs) = 'YES' then 'Resolved By QE/QCS' else null end AS remediation
            FROM orch_session AS ises
            JOIN orch_session_entry AS isee ON ises.orch_session_id = isee.session_id
            LEFT JOIN orch_session_issue AS isi ON isee.orch_session_entry_id = isi.session_entry_id
            --LEFT JOIN business_rules br ON isi.issue_column = br.FIELD
            LEFT OUTER JOIN cte_business_rule br ON br.field = isi.issue_column
            WHERE isi.orch_session_issue_id IS NOT NULL
          ;


          ATTACH '${resourceDb}' AS ${rdbSchemaName} (TYPE SQLITE);

          -- copy relevant orchestration engine admin tables into the the attached database
          ${adminTables.map((t) => ({ SQL: () => `CREATE TABLE ${rdbSchemaName}.${t.tableName} AS SELECT * FROM ${t.tableName}` }))}

          -- export content tables from DuckDb into the attached database (nature-dependent)
          ${exportsSQL};


          DETACH DATABASE ${rdbSchemaName};

          CREATE VIEW IF NOT EXISTS fhir_bundle AS
            WITH cte_fhir_patient AS (
              SELECT adt.pat_mrn_id,json_object('fullUrl', CONCAT(adt.FACILITY_ID,'-',adt.PAT_MRN_ID),
                'resource', json_object(
                      'resourceType', 'Patient',
                      'id', CONCAT(adt.FACILITY_ID,'-',adt.PAT_MRN_ID),
                      'meta', json_object(
                        'lastUpdated',(SELECT MAX(scr.RECORDED_TIME) FROM screening scr WHERE adt.FACILITY_ID = scr.FACILITY_ID),
                        'profile', json_array('http://shinny.org/StructureDefinition/shinny-patient')
                      ),
                      'language', PREFERRED_LANGUAGE_CODE,
                      'extension', json_array(
                                      json_object('extension',
                                        json_array(
                                          json_object(
                                              'url','ombCategory',
                                              'valueCoding',json_object(
                                                            'system',RACE_CODE_SYSTEM_NAME,
                                                            'code',RACE_CODE,
                                                            'display',RACE_CODE_DESCRIPTION
                                                            )
                                                      )
                                                  ),
                                            'url', 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'
                                      ),
                                      json_object('extension',
                                        json_array(
                                          json_object(
                                              'url','ombCategory',
                                              'valueCoding',json_object(
                                                            'system',ETHNICITY_CODE_SYSTEM_NAME,
                                                            'code',ETHNICITY_CODE,
                                                            'display',ETHNICITY_CODE_DESCRIPTION
                                                            )
                                                      )
                                                  ),
                                            'url', 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'
                                      ),
                                      json_object('extension',
                                        json_array(
                                          json_object(
                                              'url','ombCategory',
                                              'valueCoding',json_object(
                                                            'system',SEX_AT_BIRTH_CODE_SYSTEM,
                                                            'code',SEX_AT_BIRTH_CODE,
                                                            'display',SEX_AT_BIRTH_CODE_DESCRIPTION
                                                            )
                                                      )
                                                  ),
                                            'url', 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'
                                      ),
                                      json_object('extension',
                                        json_array(
                                          json_object(
                                              'url','ombCategory',
                                              'valueCoding',json_object(
                                                            'system',SEXUAL_ORIENTATION_CODE_SYSTEM_NAME,
                                                            'code',SEXUAL_ORIENTATION_CODE,
                                                            'display',SEXUAL_ORIENTATION_DESCRIPTION
                                                            )
                                                      )
                                                  ),
                                            'url', 'http://shinny.org/StructureDefinition/shinny-sexual-orientation'
                                      )
                                    ),
                      'identifier', json_array(
                                      json_object(
                                          'type', json_object(
                                              'coding', json_array(json_object('system', 'http://terminology.hl7.org/CodeSystem/v2-0203', 'code', 'MR')),
                                              'text', 'Medical Record Number'
                                          ),
                                          'system', adt.FACILITY_ID,
                                          'value', qat.PAT_MRN_ID,
                                          'assigner', json_object('reference', 'Organization/' || LOWER(REPLACE(qat.FACILITY_LONG_NAME, ' ', '-')) || '-' || LOWER(REPLACE(qat.ORGANIZATION_TYPE, ' ', '-')) || '-' || LOWER(REPLACE(qat.FACILITY_ID, ' ', '-')))
                                      ),
                                      CASE
                                          WHEN MEDICAID_CIN != '' THEN
                                              json_object(
                                                  'type', json_object(
                                                      'coding', json_array(json_object('system', 'http://terminology.hl7.org/CodeSystem/v2-0203', 'code', 'MA'))
                                                  ),
                                                  'system', 'http://www.medicaid.gov/',
                                                  'value', MEDICAID_CIN,
                                                  'assigner', json_object('reference', 'Organization/2.16.840.1.113883.3.249')
                                              )
                                          ELSE NULL
                                      END,
                                      CASE
                                          WHEN adt.MPI_ID IS NOT NULL THEN
                                              json_object(
                                                  'type', json_object(
                                                      'coding', json_array(json_object('system', 'http://terminology.hl7.org/CodeSystem/v2-0203', 'code', 'PN'))
                                                  ),
                                                  'system', 'http://www.acme.com/identifiers/patient',
                                                  'value', adt.MPI_ID
                                              )
                                          ELSE NULL
                                      END
                                  ),
                      'name', json_array(json_object(
                        'text', CONCAT(FIRST_NAME,' ', MIDDLE_NAME,' ', LAST_NAME),
                        'family', LAST_NAME,
                        'given', json_array(FIRST_NAME,MIDDLE_NAME))
                      ),
                      'gender', GENDER_IDENTITY_CODE_DESCRIPTION,
                      'birthDate', PAT_BIRTH_DATE,
                      'address', json_array(
                          json_object(
                            'text', CONCAT(ADDRESS1, ' ', ADDRESS2 ),
                            'line', json_array(ADDRESS1,ADDRESS2),
                            'city', CITY,
                            'state', STATE,
                            'postalCode', CAST(ZIP AS TEXT)
                        )
                      ),
                      'communication', json_array(
                        json_object('language', json_object(
                          'coding', json_array(
                            'code', PREFERRED_LANGUAGE_CODE
                          )
                        ),
                          'preferred', true
                      ))
                )) AS FHIR_Patient
            FROM ${csv.aggrPatientDemogrTableName} adt LEFT JOIN ${csv.aggrQeAdminData} qat
            ON adt.PAT_MRN_ID = qat.PAT_MRN_ID
            ),
            cte_fhir_consent AS (
              SELECT adt.pat_mrn_id,json_object('fullUrl', CONCAT('consentFor',adt.PAT_MRN_ID),
                'resource', json_object(
                      'resourceType', 'Consent',
                      'id', CONCAT('consentFor',adt.PAT_MRN_ID),
                      'meta', json_object(
                        'lastUpdated',(SELECT MAX(scr.RECORDED_TIME) FROM screening scr WHERE adt.FACILITY_ID = scr.FACILITY_ID),
                        'profile', json_array('http://shinny.org/StructureDefinition/shin-ny-organization')
                      ),
                      'status','active',
                      'category', json_object(
                        'coding',json_array(
                          json_object('system', 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                          'code', 'IDSCL')
                        )
                      ),
                      'patient', json_object(
                        'reference', CONCAT('Patient/',adt.PAT_MRN_ID)
                      ),
                      'datetime',(SELECT MAX(scr.RECORDED_TIME) FROM screening scr WHERE adt.FACILITY_ID = scr.FACILITY_ID),
                      'organization', json_object('reference', 'Organization/' || LOWER(REPLACE(qat.FACILITY_LONG_NAME, ' ', '-')) || '-' || LOWER(REPLACE(qat.ORGANIZATION_TYPE, ' ', '-')) || '-' || LOWER(REPLACE(qat.FACILITY_ID, ' ', '-')))


                )
              ) AS FHIR_Consent
            FROM ${csv.aggrPatientDemogrTableName} adt LEFT JOIN ${csv.aggrQeAdminData} qat
            ON adt.PAT_MRN_ID = qat.PAT_MRN_ID  WHERE
            LOWER(adt.consent) = 'yes'
            ),
            cte_fhir_org AS (
              SELECT qed.PAT_MRN_ID, JSON_OBJECT(
                'fullUrl', LOWER(REPLACE(qed.FACILITY_LONG_NAME, ' ', '-')) || '-' || LOWER(REPLACE(qed.ORGANIZATION_TYPE, ' ', '-')) || '-' || LOWER(REPLACE(qed.FACILITY_ID, ' ', '-')),
                'resource', JSON_OBJECT(
                    'resourceType', 'Organization',
                    'id', LOWER(REPLACE(qed.FACILITY_LONG_NAME, ' ', '-')) || '-' || LOWER(REPLACE(qed.ORGANIZATION_TYPE, ' ', '-')) || '-' || LOWER(REPLACE(qed.FACILITY_ID, ' ', '-')),
                    'meta', JSON_OBJECT(
                        'lastUpdated', (SELECT MAX(scr.RECORDED_TIME) FROM screening scr WHERE qed.FACILITY_ID = scr.FACILITY_ID),
                        'profile', JSON_ARRAY('http://shinny.org/StructureDefinition/shin-ny-organization')
                    ),
                    'identifier', JSON_ARRAY(
                        JSON_OBJECT(
                            'system', qed.FACILITY_ID,
                            'value', LOWER(REPLACE(qed.FACILITY_LONG_NAME, ' ', '-')) || '-' || LOWER(REPLACE(qed.ORGANIZATION_TYPE, ' ', '-')) || '-' || LOWER(REPLACE(qed.FACILITY_ID, ' ', '-'))
                        )
                    ),
                    'active', true,
                    'type', JSON_ARRAY(
                        JSON_OBJECT(
                            'coding', JSON_ARRAY(
                                JSON_OBJECT(
                                    'system', 'http://terminology.hl7.org/CodeSystem/organization-type',
                                    'code', qed.ORGANIZATION_TYPE,
                                    'display', qed.ORGANIZATION_TYPE
                                )
                            )
                        )
                    ),
                    'name', qed.FACILITY_LONG_NAME,
                    'address', JSON_ARRAY(
                        JSON_OBJECT(
                            'text', CONCAT(qed.FACILITY_ADDRESS1,' ', qed.FACILITY_ADDRESS2),
                            'city', qed.FACILITY_CITY,
                            'state', qed.FACILITY_STATE,
                            'postalCode', CAST(qed.FACILITY_ZIP AS TEXT)
                        )
                    )
                )
            ) AS FHIR_Organization
            FROM ${csv.aggrQeAdminData} qed),
            cte_fhir_observation AS (
              SELECT scr.PAT_MRN_ID, JSON_OBJECT(
                'fullUrl', CONCAT('observation',QUESTION_CODE),
                'resource', JSON_OBJECT(
                  'resourceType', 'Observation',
                      'id', CONCAT('observation',QUESTION_CODE),
                      'meta', JSON_OBJECT(
                          'lastUpdated', RECORDED_TIME,
                          'profile', JSON_ARRAY('http://hl7.org/fhir/us/sdoh-clinicalcare/StructureDefinition/SDOHCC-ObservationScreeningResponse')
                      ),
                      'status', SCREENING_STATUS_CODE,
                      'category', json_array(json_object('coding',json_array(json_object('system','http://terminology.hl7.org/CodeSystem/observation-category','code','social-history','display','Social History'))),json_object('coding',json_array(json_object('system','http://terminology.hl7.org/CodeSystem/observation-category','code','survey','display','Survey')))),
                      'code', json_object(
                        'coding', json_array(json_object('system',SCREENING_CODE_SYSTEM_NAME,'code',QUESTION_CODE,'display',QUESTION_CODE_DESCRIPTION))
                      ),
                      'subject', json_object('reference',CONCAT('Patient/',PAT_MRN_ID)),
                      'effectiveDateTime', RECORDED_TIME,
                      'issued', RECORDED_TIME,
                      'valueCodeableConcept',json_object('coding',json_array(json_object('system','http://loinc.org','code',ANSWER_CODE,'display',ANSWER_CODE_DESCRIPTION)))
                  )
            ) AS FHIR_Observation
            FROM ${csv.aggrScreeningTableName} scr),
            cte_fhir_encounter AS (
              SELECT scr.ENCOUNTER_ID, JSON_OBJECT(
                'resource', JSON_OBJECT(
                  'resourceType', 'Encounter',
                  'id', scr.ENCOUNTER_ID,
                  'meta', JSON_OBJECT(
                      'lastUpdated', RECORDED_TIME,
                      'profile', JSON_ARRAY('http://shinny.org/StructureDefinition/shin-ny-encounter')
                  ),
                  'status', ENCOUNTER_STATUS_CODE_DESCRIPTION,
                  'class', json_array(json_object('coding',json_array(json_object('system',ENCOUNTER_CLASS_CODE_SYSTEM,'code',ENCOUNTER_CLASS_CODE)))),
                  'type', json_array(json_object('coding',json_array(json_object('system',ENCOUNTER_TYPE_CODE_SYSTEM,'code',  CAST(ENCOUNTER_TYPE_CODE AS TEXT) )))),
                  'subject', json_object('reference',CONCAT('Patient/',scr.FACILITY_ID,'-',scr.PAT_MRN_ID))
                )
            ) AS FHIR_Encounter
            FROM ${csv.aggrScreeningTableName} scr LEFT JOIN cte_fhir_patient ON scr.PAT_MRN_ID=cte_fhir_patient.PAT_MRN_ID GROUP BY scr.ENCOUNTER_ID, scr.RECORDED_TIME, scr.ENCOUNTER_STATUS_CODE_DESCRIPTION, scr.ENCOUNTER_CLASS_CODE_SYSTEM, scr.ENCOUNTER_CLASS_CODE, scr.ENCOUNTER_TYPE_CODE_SYSTEM, scr.ENCOUNTER_TYPE_CODE, scr.PAT_MRN_ID, scr.FACILITY_ID)
            SELECT json_object(
              'resourceType', 'Bundle',
              'id', '${uuid.v1.generate()}',
              'type', 'transaction',
              'meta', JSON_OBJECT(
                  'lastUpdated', (SELECT MAX(scr.RECORDED_TIME) FROM screening scr)
              ),
              'timestamp', CURRENT_TIMESTAMP,
              'entry', json(json_group_array(json_data))
              ) AS FHIR_Bundle
              FROM (
                SELECT FHIR_Organization AS json_data FROM cte_fhir_org
                UNION ALL
                SELECT FHIR_Patient AS json_data FROM cte_fhir_patient
                UNION ALL
                SELECT FHIR_Observation AS json_data FROM cte_fhir_observation
                UNION ALL
                SELECT FHIR_Encounter AS json_data FROM cte_fhir_encounter
                UNION ALL
                SELECT FHIR_Consent AS json_data FROM cte_fhir_consent
              );

          ${afterFinalize.length > 0 ? (afterFinalize.join(";\n") + ";") : "-- no after-finalize SQL provided"}`
          .SQL(this.govn.emitCtx),
        isc.current.nbCellID,
      );
    }
  }

  // `finalize` means always run this even if errors abort the above methods
  @oeDescr.finalize()
  async emitDiagnostics() {
    const { workflowPaths: { egress } } = this.args;
    if (egress.diagsXlsxSupplier) {
      const diagsXlsx = egress.diagsXlsxSupplier();
      // if Excel workbook already exists, GDAL xlsx driver will error
      try {
        Deno.removeSync(diagsXlsx);
      } catch (_err) {
        // ignore errors if file does not exist
      }

      // deno-fmt-ignore
      await this.duckdb.execute(
        ws.unindentWhitespace(`
          INSTALL spatial; LOAD spatial;
          -- TODO: join with orch_session table to give all the results in one sheet
          COPY (SELECT * FROM orch_session_issue_classification) TO '${diagsXlsx}' WITH (FORMAT GDAL, DRIVER 'xlsx');`),
        "emitDiagnostics"
      );
    }

    const stringifiableArgs = JSON.parse(
      JSON.stringify(
        {
          ...this.args,
          sources: this.potentialSources
            ? array.distinctEntries(
              this.potentialSources.map((ps, psIndex) => ({
                uri: ps.uri,
                nature: ps.nature,
                tableName: ps.tableName,
                ingestionIssues: this.ingestables?.find(
                  (i) => i.psIndex == psIndex,
                )?.issues.length,
              })),
            )
            : undefined,
        },
        // deep copy only string-frienly properties
        (key, value) => (key == "session" ? undefined : value),
        "  ",
      ),
    );

    if (egress.diagsJsonSupplier) {
      const diagsJson = egress.diagsJsonSupplier();
      await Deno.writeTextFile(
        diagsJson,
        JSON.stringify(
          { args: stringifiableArgs, diags: this.duckdb.diagnostics },
          null,
          "  ",
        ),
      );
    }

    if (egress.fhirJsonSupplier && egress.fhirTempJsonSupplier) {
      const fhirJson = egress.fhirJsonSupplier();
      const fhirTempJson = egress.fhirTempJsonSupplier();
      try {
        await this.duckdb.execute(
          this.govn.SQL`
            COPY (
                SELECT FHIR_Bundle as FHIR FROM fhir_bundle
          ) TO '${fhirTempJson}'
          `.SQL(
            this.govn.emitCtx,
          ),
        );
        const tempJsonContent = await Deno.readTextFile(fhirTempJson);
        const tempJsonData = JSON.parse(tempJsonContent);
        const originalJsonData = tempJsonData["FHIR"];
        await Deno.writeTextFile(
          fhirJson,
          JSON.stringify(originalJsonData),
        );
        await Deno.remove(fhirTempJson);
      } catch (err) {
        // TODO: store the error in a proper log
        console.error(err);
      }
    }

    if (egress.fhirHttpSupplier) {
      const fhirHttp = egress.fhirHttpSupplier();
      let fhirHttpContent = "### Submit FHIR Resource Bundle\n\n";
      fhirHttpContent = fhirHttpContent +
        "POST https://{{host}}/{{path}}?processingAgent=QE HTTP/1.1\n";
      fhirHttpContent = fhirHttpContent + "content-type: application/json\n\n";
      fhirHttpContent = fhirHttpContent + "< ./fhir.json";
      await Deno.writeTextFile(
        fhirHttp,
        fhirHttpContent,
      );
    }

    const markdown = this.duckdb.diagnosticsMarkdown();
    if (egress.diagsMdSupplier) {
      const diagsMd = egress.diagsMdSupplier();
      await Deno.writeTextFile(
        diagsMd,
        "---\n" +
          yaml.stringify(stringifiableArgs) +
          "---\n" +
          "# Orchestration Diagnostics\n" +
          markdown,
      );
    }

    if (egress.resourceDbSupplier) {
      const {
        orchSession: sessTbl,
        orchSession: { columnNames: c },
        emitCtx: { sqlTextEmitOptions: steo },
      } = this.govn;
      const { sessionID } = this.args.session;
      const resourceDb = egress.resourceDbSupplier();
      await dax.$`sqlite3 ${resourceDb}`.stdinText(
        `UPDATE ${sessTbl.tableName} SET
            ${c.orch_finished_at} = CURRENT_TIMESTAMP,
            ${c.args_json} = ${
          steo.quotedLiteral(JSON.stringify(stringifiableArgs, null, "  "))[1]
        },
            ${c.diagnostics_json} = ${
          steo.quotedLiteral(
            JSON.stringify(this.duckdb.diagnostics, null, "  "),
          )[1]
        },
            ${c.diagnostics_md} = ${steo.quotedLiteral(markdown)[1]}
          WHERE ${c.orch_session_id} = '${sessionID}'`,
      );
    }

    await this.args.workflowPaths.finalizePaths?.();
  }
}
