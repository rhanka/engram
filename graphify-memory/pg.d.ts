declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
    rowCount: number | null;
  }

  export interface ClientConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean | Record<string, unknown>;
    statement_timeout?: number;
    query_timeout?: number;
    connectionTimeoutMillis?: number;
  }

  export class Client {
    constructor(config?: string | ClientConfig);
    connect(): Promise<void>;
    query<R extends QueryResultRow = QueryResultRow>(text: string, values?: ReadonlyArray<unknown>): Promise<QueryResult<R>>;
    end(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): this;
  }

  const pg: { Client: typeof Client };
  export default pg;
}
