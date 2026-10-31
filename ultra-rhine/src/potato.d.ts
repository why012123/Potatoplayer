export {};

declare global {
  interface Window {
    potato?: {
      invoke<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
      onEvent(listener: (event: { event: string; data: unknown }) => void): () => void;
      coverData(path: string): Promise<string | null>;
    };
  }
}
