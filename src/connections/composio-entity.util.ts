/** Deterministic Composio user/entity id per workspace (TRD §9). */
export function composioEntityId(workspaceId: string): string {
  return `ws_${workspaceId}`;
}
