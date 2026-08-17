import { spawnSync } from "node:child_process";

export interface EphemeralPostgresV1 {
  version: string;
  connection: string;
  container: string;
  stop(): void;
}

let counter = 0;

function docker(args: string[], timeoutMs = 60_000): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: timeoutMs });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** True only when a working Docker daemon is reachable; the Postgres lane is gated on it. */
export function dockerAvailable(): boolean {
  if (process.env.GRAPHIFY_MEMORY_SKIP_DOCKER === "1") return false;
  const probe = docker(["version", "--format", "{{.Server.Version}}"], 15_000);
  return probe.status === 0 && probe.stdout.trim().length > 0;
}

export function postgresImageAvailable(version: string): boolean {
  return docker(["image", "inspect", `postgres:${version}`], 15_000).status === 0;
}

async function waitForAcceptingConnections(pg: typeof import("pg"), connection: string, container: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const ready = docker(["exec", container, "pg_isready", "-U", "postgres", "-q"], 10_000);
    if (ready.status === 0) {
      const client = new pg.default.Client(connection);
      try {
        await client.connect();
        await client.query("SELECT 1");
        await client.end();
        return;
      } catch (error) {
        lastError = error;
        try { await client.end(); } catch { /* ignore */ }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`ephemeral Postgres never accepted connections: ${String(lastError)}`);
}

/**
 * Boots an ephemeral, port-mapped Postgres container for one matrix version and
 * returns a connection string.  The container binds an OS-assigned high port,
 * uses a unique name, and is force-removed by `stop()` — call it in a finally.
 */
export async function startEphemeralPostgres(version: string): Promise<EphemeralPostgresV1> {
  const container = `graphify-memory-pg-${version}-${process.pid}-${Date.now()}-${counter++}`;
  const run = docker([
    "run", "-d", "--name", container,
    "-e", "POSTGRES_PASSWORD=graphify",
    "-e", "POSTGRES_DB=graphify",
    "-e", "POSTGRES_USER=postgres",
    "-p", "127.0.0.1:0:5432",
    `postgres:${version}`,
  ], 120_000);
  if (run.status !== 0) {
    docker(["rm", "-f", container], 30_000);
    throw new Error(`could not start postgres:${version}: ${run.stderr.trim()}`);
  }
  const stop = () => { docker(["rm", "-f", container], 30_000); };
  try {
    const mapping = docker(["port", container, "5432/tcp"], 15_000);
    const match = mapping.stdout.trim().split("\n")[0]?.match(/:(\d+)\s*$/);
    if (match === null || match === undefined) throw new Error(`could not resolve host port: ${mapping.stdout}${mapping.stderr}`);
    const port = Number(match[1]);
    const connection = `postgresql://postgres:graphify@127.0.0.1:${port}/graphify`;
    const pg = await import("pg");
    await waitForAcceptingConnections(pg, connection, container);
    return { version, connection, container, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
