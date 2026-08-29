// [FR6][R7] The MVP1 adapter: writes to the application log instead of paging anyone. Never
// throws — a notification failure must not be able to take down escalation creation itself,
// the same posture server/services/classifier and server/services/conversation already take
// toward their own failure modes, even though logging is about as close to "can't fail" as an
// I/O operation gets.

import { logger } from '../../utils/logger'
import type { EscalationNotification, NotificationService } from './notification-service'

export class ConsoleNotificationService implements NotificationService {
  async notifyEscalation(notification: EscalationNotification): Promise<void> {
    try {
      logger.info('Escalation created — human review needed', {
        escalationId: notification.escalationId,
        riskLevel: notification.riskLevel,
        pseudonym: notification.pseudonym,
        createdAt: notification.createdAt.toISOString()
      })
    } catch {
      // Never let a logging failure propagate out of a notification call.
    }
  }
}
