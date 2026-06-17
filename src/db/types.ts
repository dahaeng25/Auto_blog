export type SqlRow = Record<string, unknown>;

export interface SqlResult {
  rows: SqlRow[];
  lastInsertRowid?: number | bigint;
}

export interface DbExecutor {
  execute(sql: string, args?: unknown[]): Promise<SqlResult>;
  batch(
    statements: Array<{ sql: string; args?: unknown[] }>,
  ): Promise<SqlResult[]>;
}
