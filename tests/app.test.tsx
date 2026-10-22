import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { incoming, pendingRequest } from './fixtures';

function mockApi({ failSend = false, invalidSettings = false, suspendedSend = false } = {}) {
  let deliver = false;
  let delivered = false;
  let receiveSignal: AbortSignal | null | undefined;
  const mock = vi.fn(async (url: string, options: RequestInit) => {
    if (url.includes('/getStateInstance/')) return Response.json({ stateInstance: 'authorized' });
    if (url.includes('/getSettings/'))
      return Response.json({
        typeInstance: 'v3',
        webhookUrl: invalidSettings ? 'https://example.com' : '',
        incomingWebhook: 'yes',
      });
    if (url.includes('/checkAccount/')) return Response.json({ exist: true, chatId: '10000001' });
    if (url.includes('/sendMessage/')) {
      if (failSend) throw new TypeError('Network error');
      deliver = true;
      if (suspendedSend) return new Response('Your account is suspended', { status: 403 });
      return Response.json({ idMessage: 'outgoing-1' });
    }
    if (url.includes('/receiveNotification/')) {
      receiveSignal = options.signal;
      if (deliver && !delivered) {
        delivered = true;
        return Response.json(incoming());
      }
      return Response.json(null);
    }
    if (url.includes('/deleteNotification/')) return Response.json({ result: true });
    return pendingRequest(options.signal);
  });
  vi.stubGlobal('fetch', mock);
  return { mock, getReceiveSignal: () => receiveSignal };
}

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/ID инстанса/), '3100000000');
  await user.type(screen.getByLabelText(/API-токен/), 'test-token-not-real');
  await user.click(screen.getByRole('button', { name: /Начать общение/ }));
}

async function createChat(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Новый чат' }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Телефон получателя'), '+7 (900) 000-00-01');
  await user.click(within(dialog).getByRole('button', { name: 'Создать чат' }));
  await screen.findByRole('textbox', { name: 'Сообщение' });
}

describe('chat user journey', () => {
  it('continues receiving when MAX temporarily restricts sending', async () => {
    mockApi({ suspendedSend: true });
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await createChat(user);
    const composer = screen.getByRole('textbox', { name: 'Сообщение' });
    await user.type(composer, 'Текст сохранится{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('MAX временно ограничил отправку');
    expect(await screen.findByText('Привет из теста!')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Подключено');
    expect(composer).toBeEnabled();
    expect(composer).toHaveValue('Текст сохранится');
  });
  it('connects, creates a canonical chat, sends on Enter, receives an answer and clears the session', async () => {
    const api = mockApi();
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await createChat(user);
    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет!{Enter}');
    expect(await screen.findByLabelText('Принято API')).toBeInTheDocument();
    expect(await screen.findByText('Привет из теста!')).toBeInTheDocument();
    const sendCall = api.mock.mock.calls.find((call) => call[0].includes('/sendMessage/'))!;
    expect(JSON.parse(sendCall[1].body as string)).toEqual({
      chatId: '10000001',
      message: 'Привет!',
    });
    await waitFor(() =>
      expect(api.mock.mock.calls.some((call) => call[0].includes('/deleteNotification/'))).toBe(
        true,
      ),
    );
    const signal = api.getReceiveSignal();
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('heading', { name: 'Подключить MAX' })).toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
    expect(screen.getByLabelText(/API-токен/)).toHaveValue('');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it('retains the draft after a failed send and does not retry automatically', async () => {
    const api = mockApi({ failSend: true });
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await createChat(user);
    const composer = screen.getByRole('textbox', { name: 'Сообщение' });
    await user.type(composer, 'Сохраните этот текст');
    await user.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Перед повторной отправкой проверьте MAX',
    );
    expect(composer).toHaveValue('Сохраните этот текст');
    expect(api.mock.mock.calls.filter((call) => call[0].includes('/sendMessage/'))).toHaveLength(1);
  });
  it('keeps the user on login when settings would prevent receiving answers', async () => {
    mockApi({ invalidSettings: true });
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('очистите webhookUrl');
    expect(screen.queryByRole('button', { name: 'Новый чат' })).not.toBeInTheDocument();
  });
});
