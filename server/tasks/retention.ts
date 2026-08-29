// [NFR1] Scheduled wrapper around server/utils/retention.ts's runRetentionTask() — see that
// file for the actual logic and why it lives there rather than here. Nitro's
// defineTask/scheduledTasks are marked @experimental in the installed nitropack version's own
// types but are the current, functional convention; see nuxt.config.ts's nitro block for how
// this file gets registered and scheduled (daily, 03:00 UTC).

import { runRetentionTask } from '../utils/retention'

export default defineTask({
  meta: {
    name: 'retention',
    description:
      'Deletes free-text entries, abandoned screening sessions, and audit log rows past their configured retention windows (NFR1).'
  },
  async run() {
    const result = await runRetentionTask()
    return { result }
  }
})
