// [R6][R7] The real provider implementation, against Anthropic's Messages API. Every call
// records the exact model string the API reports back (modelVersion) — never trusts the
// requested model name alone, since a provider can route a request to a different underlying
// model than the one named.

import { z } from 'zod'
import type { LlmRequest, LlmResponse } from '../../domain/llm-contract'
import type { LlmClient } from './client'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const responseSchema = z.object({
  model: z.string().min(1),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative()
  })
})

export interface AnthropicClientOptions {
  apiKey: string
  model: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class AnthropicClient implements LlmClient {
  private readonly apiKey: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: AnthropicClientOptions) {
    this.apiKey = options.apiKey
    this.model = options.model
    this.timeoutMs = options.timeoutMs
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const start = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    const systemMessages = request.messages.filter((m) => m.role === 'system')
    const conversationMessages = request.messages.filter((m) => m.role !== 'system')

    try {
      const res = await this.fetchImpl(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens,
          system: systemMessages.map((m) => m.content).join('\n\n'),
          messages: conversationMessages.map((m) => ({ role: m.role, content: m.content }))
        }),
        signal: controller.signal
      })

      if (!res.ok) throw new Error(`Anthropic API responded with status ${res.status}`)

      const body: unknown = await res.json()
      const parsed = responseSchema.parse(body)
      const text = parsed.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('')

      return {
        text,
        modelName: this.model,
        modelVersion: parsed.model,
        promptTokens: parsed.usage.input_tokens,
        completionTokens: parsed.usage.output_tokens,
        latencyMs: Date.now() - start
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}
