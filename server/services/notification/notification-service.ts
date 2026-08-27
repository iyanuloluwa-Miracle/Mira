// [FR6] The seam every escalation-notification adapter implements. Deliberately narrow: no
// free text, no raw identifier — a pseudonym is the most identifying thing any adapter ever
// receives, matching the same "clinician sees a pseudonym, never a real identifier" discipline
// FR7's dashboard follows.

export interface EscalationNotification {
  escalationId: string
  riskLevel: string
  pseudonym: string
  createdAt: Date
}

export interface NotificationService {
  notifyEscalation(notification: EscalationNotification): Promise<void>
}
