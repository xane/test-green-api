import { describe, expect, it, vi } from 'vitest';
import { ApiError, GreenApi, normalizePhone, validateCredentials } from '../src/api';
import { credentials, pendingRequest } from './fixtures';

describe('API contract', () => {
  it.each(['whatsapp', 'telegram', undefined])(
    'rejects a non-MAX or unknown instance type: %s',
    async (typeInstance) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' }))
          .mockResolvedValueOnce(
            Response.json({ typeInstance, incomingWebhook: 'yes', webhookUrl: '' }),
          ),
      );
      await expect(new GreenApi(credentials).connect(new AbortController().signal)).rejects.toThrow(
        'инстанс MAX',
      );
    },
  );
  it('keeps a temporary sending restriction distinct from invalid credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Your account is suspended', { status: 403 })),
    );
    await expect(
      new GreenApi(credentials).sendMessage('10000001', 'Привет', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'api' });
  });
  it('rejects empty or oversized messages before making a request', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    const api = new GreenApi(credentials);
    for (const text of ['   ', 'a'.repeat(4001)]) {
      await expect(api.sendMessage('10000001', text, new AbortController().signal)).rejects.toThrow(
        '4000',
      );
    }
    expect(mock).not.toHaveBeenCalled();
  });
  it('reports a missing recipient without creating a fabricated chat identifier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ exist: false, chatId: '' })));
    await expect(
      new GreenApi(credentials).checkAccount('79000000001', new AbortController().signal),
    ).rejects.toThrow('не найден аккаунт MAX');
  });
  it('normalizes Russian and Belarusian phone numbers without accepting garbage', () => {
    expect(normalizePhone('8 (900) 000-00-01')).toBe('79000000001');
    expect(normalizePhone('+375 (29) 000-00-00')).toBe('375290000000');
    for (const value of ['+1 202 555 0100', '79000000001 ext 123', '123', ''])
      expect(() => normalizePhone(value)).toThrow(ApiError);
  });
  it('rejects non-GREEN-API hosts and URL credentials before transmitting the token', () => {
    for (const url of [
      'https://evil.example',
      'http://api.green-api.com',
      'https://api.green-api.com.evil.example',
      'https://me:secret@api.green-api.com',
      'https://api.green-api.com/other',
      'https://api.green-api.com/?token=123',
    ]) {
      expect(() => validateCredentials({ ...credentials, apiUrl: url })).toThrow(ApiError);
    }
    expect(
      validateCredentials({ ...credentials, apiUrl: 'https://3502.api.green-api.com/v3/' }).apiUrl,
    ).toBe('https://3502.api.green-api.com/v3');
  });
  it('uses the documented phoneNumber and canonical chatId wire formats', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ exist: true, chatId: '10000001' }))
      .mockResolvedValueOnce(Response.json({ idMessage: 'message-1' }));
    vi.stubGlobal('fetch', mock);
    const api = new GreenApi(credentials);
    const signal = new AbortController().signal;
    const chatId = await api.checkAccount('79000000001', signal);
    expect(chatId).toBe('10000001');
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({ phoneNumber: 79000000001 });
    expect(await api.sendMessage(chatId, 'Привет', signal)).toBe('message-1');
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({
      chatId: '10000001',
      message: 'Привет',
    });
  });
  it('checks instance state and notification settings without changing them', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(
        Response.json({ typeInstance: 'v3', incomingWebhook: 'no', webhookUrl: '' }),
      );
    vi.stubGlobal('fetch', mock);
    await expect(new GreenApi(credentials).connect(new AbortController().signal)).rejects.toThrow(
      'включите входящие уведомления',
    );
    expect(mock.mock.calls.every((call) => call[1].method === 'GET')).toBe(true);
  });
  it('handles an empty long-poll response and explicitly acknowledges receipts', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(Response.json({ result: true }));
    vi.stubGlobal('fetch', mock);
    const api = new GreenApi(credentials);
    const signal = new AbortController().signal;
    expect(await api.receiveNotification(signal)).toBeNull();
    await api.deleteNotification(101, signal);
    expect(mock.mock.calls[1][0]).toContain('/deleteNotification/test-token-not-real/101');
    expect(mock.mock.calls[1][1].method).toBe('DELETE');
  });
  it('never retries a send or exposes a token-bearing network error', async () => {
    const mock = vi.fn().mockRejectedValue(new Error(`Failed ${credentials.apiTokenInstance}`));
    vi.stubGlobal('fetch', mock);
    const promise = new GreenApi(credentials).sendMessage(
      '1',
      'Привет',
      new AbortController().signal,
    );
    await expect(promise).rejects.toThrow('Не удалось связаться');
    await expect(promise).rejects.not.toThrow(credentials.apiTokenInstance);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('aborts active requests on logout and classifies rejected access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options: RequestInit) => pendingRequest(options.signal)),
    );
    const controller = new AbortController();
    const request = new GreenApi(credentials).receiveNotification(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(
      new GreenApi(credentials).receiveNotification(new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'auth' });
  });
});
