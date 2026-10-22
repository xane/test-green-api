export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export interface Chat {
  id: string;
  name: string;
  phone?: string;
  unread: number;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'uncertain';
}

export interface NotificationEnvelope {
  receiptId: number;
  body: Record<string, unknown>;
}

export interface IncomingMessage {
  chat: Omit<Chat, 'unread'>;
  message: Message;
}

export interface ConnectionStatus {
  kind: 'connected' | 'reconnecting' | 'stopped';
  message?: string;
}
