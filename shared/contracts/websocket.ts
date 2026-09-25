export type ClientMessageType = 'telemetry' | 'redesign_request';

export type ServerMessageType =
  | 'redesign_started'
  | 'redesign_result'
  | 'redesign_failed';

export type WebSocketMessage = {
  type: string;
  payload: unknown;
};

export type ClientMessage = WebSocketMessage & {
  type: ClientMessageType;
};

export type ServerMessage = WebSocketMessage & {
  type: ServerMessageType;
};