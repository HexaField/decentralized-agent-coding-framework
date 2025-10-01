export type Provider = 'local' | 'cloud'

export interface ProviderSelection {
  provider: Provider
  model: string
}

export interface ProviderChoiceInput {
  preferred?: Provider
  model?: string
}

export function chooseProvider(input: ProviderChoiceInput = {}): ProviderSelection {
  const preferred: Provider = input.preferred === 'cloud' ? 'cloud' : 'local'
  const model = input.model || (preferred === 'local' ? 'llama3' : 'gpt-4o')
  return { provider: preferred, model }
}
