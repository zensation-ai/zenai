declare module 'glob' {
  export function glob(
    pattern: string,
    options?: Record<string, unknown>,
  ): Promise<string[]>;
}
