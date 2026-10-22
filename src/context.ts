import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';
import type { ChatAction, ChatState } from './state';

export interface ChatService {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
  openChat: (phone: string, signal?: AbortSignal) => Promise<void>;
  send: (chatId: string, text: string) => Promise<void>;
}

export const ChatContext = createContext<ChatService | null>(null);

export function useChat(): ChatService {
  const service = useContext(ChatContext);
  if (!service) throw new Error('ChatProvider is missing');
  return service;
}
