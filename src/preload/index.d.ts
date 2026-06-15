import type { SnapitApi } from './index'

declare global {
  interface Window {
    snapit: SnapitApi
  }
}
