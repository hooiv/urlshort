export const SERVICE_WORKER_URL = '/sw.js'

export function canUseServiceWorker(serviceWorkerInNavigator: boolean): boolean {
  return serviceWorkerInNavigator === true
}
