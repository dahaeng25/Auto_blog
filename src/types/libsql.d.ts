declare module "@libsql/client" {
  export interface ResultSet {
    rows: unknown[];
    lastInsertRowid?: number | bigint;
  }

  export interface Client {
    execute(opts: { sql: string; args?: unknown[] }): Promise<ResultSet>;
    batch(
      stmts: Array<{ sql: string; args?: unknown[] }>,
    ): Promise<ResultSet[]>;
  }

  export function createClient(opts: {
    url: string;
    authToken?: string;
  }): Client;
}
