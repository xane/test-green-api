import type { Chat, ConnectionStatus, IncomingMessage, Message } from './types';

export interface ChatState {
  chats: Chat[];
  messages: Record<string, Message[]>;
  drafts: Record<string, string>;
  activeChatId: string | null;
  connection: ConnectionStatus;
}

export const initialState: ChatState = {
  chats: [],
  messages: {},
  drafts: {},
  activeChatId: null,
  connection: { kind: 'connected' },
};

export type ChatAction =
  | { type: 'open'; chat: Omit<Chat, 'unread'> }
  | { type: 'select'; id: string | null }
  | { type: 'draft'; chatId: string; text: string }
  | { type: 'incoming'; incoming: IncomingMessage }
  | { type: 'pending'; message: Message }
  | { type: 'accepted'; chatId: string; temporaryId: string; id: string; originalText: string }
  | { type: 'uncertain'; chatId: string; temporaryId: string }
  | { type: 'connection'; status: ConnectionStatus };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'open': {
      const existing = state.chats.find((chat) => chat.id === action.chat.id);
      return {
        ...state,
        activeChatId: action.chat.id,
        chats: existing
          ? state.chats.map((chat) =>
              chat.id === action.chat.id
                ? { ...chat, phone: action.chat.phone ?? chat.phone, unread: 0 }
                : chat,
            )
          : [{ ...action.chat, unread: 0 }, ...state.chats],
      };
    }
    case 'select':
      return {
        ...state,
        activeChatId: action.id,
        chats: state.chats.map((chat) => (chat.id === action.id ? { ...chat, unread: 0 } : chat)),
      };
    case 'draft':
      return { ...state, drafts: { ...state.drafts, [action.chatId]: action.text } };
    case 'incoming': {
      const { chat, message } = action.incoming;
      const previous = state.messages[chat.id] || [];
      if (previous.some((item) => item.id === message.id)) return state;
      const existing = state.chats.find((item) => item.id === chat.id);
      const updated = {
        ...existing,
        ...chat,
        phone: chat.phone ?? existing?.phone,
        unread: state.activeChatId === chat.id ? 0 : (existing?.unread || 0) + 1,
      };
      return {
        ...state,
        chats: [updated, ...state.chats.filter((item) => item.id !== chat.id)],
        messages: {
          ...state.messages,
          // GREEN-API timestamps have second precision. Preserve arrival order
          // within a second so a reply cannot precede a locally timed send.
          [chat.id]: [...previous, message].sort(
            (a, b) => Math.floor(a.timestamp / 1000) - Math.floor(b.timestamp / 1000),
          ),
        },
      };
    }
    case 'pending':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.message.chatId]: [
            ...(state.messages[action.message.chatId] || []),
            action.message,
          ],
        },
      };
    case 'accepted':
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.chatId]:
            state.drafts[action.chatId] === action.originalText
              ? ''
              : state.drafts[action.chatId] || '',
        },
        messages: {
          ...state.messages,
          [action.chatId]: (state.messages[action.chatId] || []).map((message) =>
            message.id === action.temporaryId
              ? { ...message, id: action.id, status: 'accepted' }
              : message,
          ),
        },
      };
    case 'uncertain':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatId]: (state.messages[action.chatId] || []).map((message) =>
            message.id === action.temporaryId ? { ...message, status: 'uncertain' } : message,
          ),
        },
      };
    case 'connection':
      return { ...state, connection: action.status };
  }
}
