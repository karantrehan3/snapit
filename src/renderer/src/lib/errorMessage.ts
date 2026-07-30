/**
 * Readable message for anything thrown, keeping the error's `name` when it carries meaning.
 *
 * The name is the diagnostically useful half for platform errors: WebCodecs failures arrive
 * as DOMException, where "OperationError: Unsupported configuration parameters" and
 * "InvalidStateError: Cannot call encode on a closed codec" are the same `message` shape but
 * completely different problems — the first is a config we must not ask for, the second is a
 * consequence of the first. Reporting only `.message` throws that away.
 *
 * Note DOMException *does* extend Error in both Chromium and Node, so `instanceof Error` is
 * not the trap it looks like. The trap is `console.error('...', e)`: passing the object means
 * Electron's log forwarding stringifies it to "[object DOMException]", which is how a
 * recording failure once went undiagnosed. Interpolate this function's result instead.
 */
export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const { name, message } = e as { name?: unknown; message?: unknown }
    const hasName = typeof name === 'string' && name.length > 0 && name !== 'Error'
    const hasMessage = typeof message === 'string' && message.length > 0
    if (hasName && hasMessage) return `${name}: ${message}`
    if (hasMessage) return message as string
    if (hasName) return name as string
  }
  if (e instanceof Error) return e.message
  return String(e)
}
