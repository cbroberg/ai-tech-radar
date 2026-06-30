import { createAI, openrouterAdapter, parseJsonLoose } from '@broberg/ai-sdk'

// DeepSeek V3 via OpenRouter — cheap, fast, no Anthropic billing
const DEEPSEEK = { provider: 'openrouter', model: 'deepseek/deepseek-chat', transport: 'http' }

export const ai = createAI({
  providers: {
    openrouter: openrouterAdapter(),
  },
  defaults: {
    cheap: DEEPSEEK,
  },
})

export { parseJsonLoose }
