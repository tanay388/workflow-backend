import { extractChatUserMessage } from '../utils/workflow-variables';

export function buildAgentUserMessage(
  resolvedPrompt: string,
  upstreamInput: unknown,
  runInput: unknown,
  triggerSource?: string,
): string {
  const parts: string[] = [];
  const prompt = resolvedPrompt.trim();
  if (prompt) parts.push(prompt);

  const chatFromRun = extractChatUserMessage(runInput);
  const chatFromUpstream = extractChatUserMessage(upstreamInput);
  const chatMessage = chatFromRun ?? chatFromUpstream;

  if (chatMessage) {
    parts.push(chatMessage);
  } else if (!prompt && upstreamInput != null) {
    if (typeof upstreamInput === 'string') {
      parts.push(upstreamInput);
    } else if (typeof upstreamInput === 'object' && !Array.isArray(upstreamInput)) {
      const obj = upstreamInput as Record<string, unknown>;
      if (Object.keys(obj).length > 0) {
        parts.push(JSON.stringify(obj));
      }
    }
  }

  if ((triggerSource === 'chat' || triggerSource === 'widget') && chatMessage && prompt) {
    return parts.join('\n\n');
  }

  return parts.join('\n\n').trim();
}
