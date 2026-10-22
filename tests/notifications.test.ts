import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api';
import { parseIncoming, pollNotifications } from '../src/notifications';
import { incoming } from './fixtures';

describe('notification processing', () => {
  it('does not process a late response after the connection is cancelled', async () => {
    const controller = new AbortController();
    const onMessage = vi.fn();
    const api = {
      receiveNotification: vi.fn(async () => {
        controller.abort();
        return incoming();
      }),
      deleteNotification: vi.fn(),
    };
    await pollNotifications(api, controller.signal, onMessage, vi.fn());
    expect(onMessage).not.toHaveBeenCalled();
    expect(api.deleteNotification).not.toHaveBeenCalled();
  });
  it('parses both text types, ignores unsupported events and rejects malformed data', () => {
    expect(parseIncoming(incoming().body)?.message.text).toBe('Привет из теста!');
    const link = incoming().body;
    link.messageData = {
      typeMessage: 'extendedTextMessage',
      extendedTextMessageData: { text: 'https://example.com' },
    };
    expect(parseIncoming(link)?.message.text).toBe('https://example.com');
    expect(parseIncoming({ typeWebhook: 'outgoingMessageStatus' })).toBeNull();
    expect(parseIncoming({ ...incoming().body, timestamp: 'bad' })).toBeNull();
    expect(parseIncoming(incoming('1', '-100').body)).toBeNull();
  });
  it('waits for acknowledgement before receiving the next event, including unsupported events', async () => {
    const controller = new AbortController();
    const order: string[] = [];
    let count = 0;
    const api = {
      receiveNotification: vi.fn(async () => {
        order.push('receive');
        count++;
        return count === 1 ? incoming() : { receiptId: 102, body: { typeWebhook: 'unknown' } };
      }),
      deleteNotification: vi.fn(async () => {
        order.push('delete');
        if (count === 2) controller.abort();
      }),
    };
    const onMessage = vi.fn();
    await pollNotifications(api, controller.signal, onMessage, vi.fn());
    expect(order).toEqual(['receive', 'delete', 'receive', 'delete']);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });
  it('backs off on transient failures and stops on authentication errors', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const receive = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Сеть', 'network'))
      .mockRejectedValueOnce(new ApiError('Доступ', 'auth'));
    const onStatus = vi.fn();
    const task = pollNotifications(
      { receiveNotification: receive, deleteNotification: vi.fn() },
      controller.signal,
      vi.fn(),
      onStatus,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(receive).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await task;
    expect(receive).toHaveBeenCalledTimes(2);
    expect(onStatus.mock.calls.map((call) => call[0].kind)).toEqual(['reconnecting', 'stopped']);
  });
});
