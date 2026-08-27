// [FR6] The only way anything outside this folder should get a NotificationService. One
// adapter today (console); the seam for email/SMS later is the interface itself
// (notification-service.ts) plus this single factory function — a real adapter slots in here
// without any caller needing to change.

import type { NotificationService } from './notification-service'
import { ConsoleNotificationService } from './console-notification-service'

export type { EscalationNotification, NotificationService } from './notification-service'
export { ConsoleNotificationService } from './console-notification-service'

export function createNotificationService(): NotificationService {
  return new ConsoleNotificationService()
}
