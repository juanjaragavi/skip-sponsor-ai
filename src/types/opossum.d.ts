declare module "opossum" {
  export default class CircuitBreaker<T extends (...args: never[]) => unknown> {
    constructor(action: T, options?: Record<string, unknown>);
    fire(...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>;
    on(event: string, cb: (...args: unknown[]) => void): void;
    /** Force the breaker open: fire() rejects without calling the action. */
    open(): void;
    /** Force the breaker closed: fire() calls the action again. */
    close(): void;
    readonly opened: boolean;
  }
}
