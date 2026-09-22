export type ClientMessage = {
  type: string;
  payload: Record<string, unknown>;
};

export function formatMessage(type: string, payload: Record<string, unknown>): ClientMessage {
  return { type, payload };
}
