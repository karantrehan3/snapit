/**
 * How a service says no.
 *
 * These live in core rather than in the HTTP layer because the failures are the service's,
 * not the transport's — "that capture is in another workspace" is true whether the caller
 * is a router or the desktop app calling in-process. The transport's job is to map them;
 * inventing its own set is how the two modes end up disagreeing about what is allowed.
 *
 * A status code is the vocabulary because it is the one every caller already understands,
 * and because the HTTP deployment then needs no table.
 */
export class ServiceError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string): ServiceError => new ServiceError(400, 'bad_request', message)
export const unauthorized = (message: string): ServiceError => new ServiceError(401, 'unauthorized', message)
export const forbidden = (message: string): ServiceError => new ServiceError(403, 'forbidden', message)
export const notFound = (message: string): ServiceError => new ServiceError(404, 'not_found', message)
export const conflict = (message: string): ServiceError => new ServiceError(409, 'conflict', message)
