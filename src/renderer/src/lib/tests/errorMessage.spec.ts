import { describe, it, expect } from 'vitest'
import { errorMessage } from '../errorMessage'

describe('errorMessage', () => {
  it('uses the message of a real Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('keeps the name of a DOMException, where it identifies the actual problem', () => {
    const e = new DOMException('Cannot call encode on a closed codec.', 'InvalidStateError')
    expect(errorMessage(e)).toBe('InvalidStateError: Cannot call encode on a closed codec.')
  })

  it('distinguishes the two WebCodecs failures that look alike in `message` alone', () => {
    const cause = new DOMException('Unsupported configuration parameters.', 'OperationError')
    const effect = new DOMException('Cannot call encode on a closed codec.', 'InvalidStateError')
    expect(errorMessage(cause)).not.toBe(errorMessage(effect))
    expect(errorMessage(cause)).toContain('OperationError')
    expect(errorMessage(effect)).toContain('InvalidStateError')
  })

  it('does not prefix a plain Error with its useless generic name', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('keeps the subclass name of a custom Error', () => {
    class EncoderError extends Error {
      override name = 'EncoderError'
    }
    expect(errorMessage(new EncoderError('flush failed'))).toBe('EncoderError: flush failed')
  })

  it('handles an error-like object with only a name', () => {
    expect(errorMessage({ name: 'AbortError' })).toBe('AbortError')
  })

  it('handles an error-like object with only a message', () => {
    expect(errorMessage({ message: 'something failed' })).toBe('something failed')
  })

  it('never returns the useless object placeholder for an error-like value', () => {
    const e = new DOMException('nope', 'NotSupportedError')
    expect(errorMessage(e)).not.toContain('[object')
  })

  it('falls back to stringification for primitives', () => {
    expect(errorMessage('plain string')).toBe('plain string')
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
    expect(errorMessage(undefined)).toBe('undefined')
  })

  it('does not throw on an object with no usable fields', () => {
    expect(() => errorMessage({})).not.toThrow()
    expect(typeof errorMessage({})).toBe('string')
  })

  it('ignores non-string name/message rather than interpolating them oddly', () => {
    expect(errorMessage({ name: 123, message: null })).toBe('[object Object]')
  })
})
