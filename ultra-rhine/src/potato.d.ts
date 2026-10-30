export {};

declare global {
  interface Window {
    potato?: {
      invoke<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
      coverData(path: string): Promise<string | null>;
    };
  }
}
