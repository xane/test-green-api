import { describe, expect, it } from 'vitest';
import { chatReducer, initialState } from '../src/state';
import { parseIncoming } from '../src/notifications';
import { incoming } from './fixtures';

describe('chat state', () => {
  it('keeps a same-second reply after the outgoing message despite different timestamp precision', () => {
    const reply = parseIncoming(incoming().body)!;
    let state = chatReducer(initialState, {
      type: 'pending',
      message: {
        id: 'local:1',
        chatId: reply.chat.id,
        text: 'Привет',
        timestamp: reply.message.timestamp + 800,
        direction: 'outgoing',
        status: 'pending',
      },
    });
    state = chatReducer(state, { type: 'incoming', incoming: reply });
    expect(state.messages[reply.chat.id].map((message) => message.direction)).toEqual([
      'outgoing',
      'incoming',
    ]);
  });
  it('deduplicates redeliveries, counts unread messages and selects without losing other conversations', () => {
    const first = parseIncoming(incoming().body)!;
    const second = parseIncoming(incoming('incoming-2', '10000002').body)!;
    let state = chatReducer(initialState, { type: 'incoming', incoming: first });
    expect(state.chats[0].unread).toBe(1);
    expect(chatReducer(state, { type: 'incoming', incoming: first })).toBe(state);
    state = chatReducer(state, { type: 'incoming', incoming: second });
    state = chatReducer(state, { type: 'select', id: first.chat.id });
    expect(state.chats.find((chat) => chat.id === first.chat.id)?.unread).toBe(0);
    expect(state.messages[second.chat.id]).toHaveLength(1);
    state = chatReducer(state, {
      type: 'open',
      chat: { id: first.chat.id, name: '+79000000001', phone: '79000000001' },
    });
    expect(state.chats).toHaveLength(2);
  });
  it('does not clear a newer draft when a send completes, or clear drafts in other chats', () => {
    let state = chatReducer(initialState, { type: 'draft', chatId: 'one', text: 'новый текст' });
    state = chatReducer(state, { type: 'draft', chatId: 'two', text: 'другой чат' });
    state = chatReducer(state, {
      type: 'accepted',
      chatId: 'one',
      temporaryId: 'local',
      id: 'real',
      originalText: 'старый текст',
    });
    expect(state.drafts).toEqual({ one: 'новый текст', two: 'другой чат' });
  });
});
