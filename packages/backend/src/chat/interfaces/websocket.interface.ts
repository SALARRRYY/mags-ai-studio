export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
}

export interface ChatStreamEvent {
  type: 'start' | 'chunk' | 'complete' | 'error';
  data: {
    messageId?: string;
    token?: string;
    content?: string;
    tokens?: number;
    error?: string;
  };
  timestamp: number;
}
