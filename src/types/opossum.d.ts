declare module "opossum" {
  export default class CircuitBreaker<T extends (...args: never[]) => unknown> {
    constructor(action: T, options?: Record<string, unknown>);
    fire(...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>;
    on(event: string, cb: (...args: unknown[]) => void): void;
  }
}
