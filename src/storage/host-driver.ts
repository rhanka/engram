/** The host owns driver loading (public-substrate amendment §§3.9, 5.7). */
export class HostDriverRequiredError extends Error {
  readonly code = "HOST_DRIVER_REQUIRED";

  constructor(store: string, driver: string) {
    super(`store '${store}': the host must inject ${driver} via deps.driverModule`);
    this.name = "HostDriverRequiredError";
  }
}

export function requireHostDriver(store: string, driver: string, driverModule: unknown): Record<string, unknown> {
  if (driverModule === undefined) throw new HostDriverRequiredError(store, driver);
  return driverModule as Record<string, unknown>;
}
