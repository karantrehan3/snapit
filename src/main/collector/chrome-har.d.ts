/**
 * `chrome-har` ships no types. Only the one function is used, and only with the raw CDP
 * event stream, so the surface declared here is deliberately narrow.
 */
declare module 'chrome-har' {
  export function harFromMessages(
    messages: { method: string; params: unknown }[],
    options?: { includeTextFromResponseBody?: boolean }
  ): unknown
}
