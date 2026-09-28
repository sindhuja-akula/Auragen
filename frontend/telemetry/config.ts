// WebSocket URL of the backend (start it with: npm run start:ws).
// To change it without editing code, create frontend/.env with:
//   VITE_WS_URL=ws://127.0.0.1:3001
const DEFAULT_WS_URL = 'ws://127.0.0.1:3001';

type ViteEnv = { env?: { VITE_WS_URL?: string } };

export const WS_URL: string =
  (import.meta as unknown as ViteEnv).env?.VITE_WS_URL ?? DEFAULT_WS_URL;