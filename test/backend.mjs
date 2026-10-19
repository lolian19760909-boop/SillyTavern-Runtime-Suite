export const getChatCompletionModel = () => 'fixture-model';
export async function createGenerationParameters(settings, model, type, messages) {
  return { generate_data: { messages, model, max_tokens: settings.openai_max_tokens, stream: false } };
}
