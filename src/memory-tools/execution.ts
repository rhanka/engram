/** In-process execution state; never serialized into neutral requests. */
export interface MemoryExecutionControlV1 {
  readonly signal?: AbortSignal;
  commitPhaseEntered?: boolean;
}
