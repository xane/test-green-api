import { ApiError, isRecord } from './api';
import type { GreenApi } from './api';
import type { ConnectionStatus, IncomingMessage } from './types';

export function parseIncoming(body: Record<string, unknown>): IncomingMessage | null {
  if (
    body.typeWebhook !== 'incomingMessageReceived' ||
    !isRecord(body.senderData) ||
    !isRecord(body.messageData)
  )
    return null;
  const sender = body.senderData;
  const data = body.messageData;
  let text: unknown;
  if (data.typeMessage === 'textMessage' && isRecord(data.textMessageData))
    text = data.textMessageData.textMessage;
  if (data.typeMessage === 'extendedTextMessage' && isRecord(data.extendedTextMessageData))
    text = data.extendedTextMessageData.text;
  if (
    typeof text !== 'string' ||
    !text ||
    typeof sender.chatId !== 'string' ||
    !sender.chatId ||
    typeof body.idMessage !== 'string' ||
    !body.idMessage ||
    typeof body.timestamp !== 'number' ||
    !Number.isFinite(new Date(body.timestamp * 1000).getTime())
  )
    return null;
  // The assignment covers direct chats, not groups or bots.
  if (sender.chatType === 'group' || sender.chatId.startsWith('-')) return null;
  const name = [sender.senderContactName, sender.chatName, sender.senderName].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const phone =
    typeof sender.senderPhoneNumber === 'number' && sender.senderPhoneNumber > 0
      ? String(sender.senderPhoneNumber)
      : undefined;
  return {
    chat: {
      id: sender.chatId,
      name: name || (phone ? `+${phone}` : `Чат ${sender.chatId}`),
      phone,
    },
    message: {
      id: body.idMessage,
      chatId: sender.chatId,
      text,
      timestamp: body.timestamp * 1000,
      direction: 'incoming',
      status: 'accepted',
    },
  };
}

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Отменено', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Отменено', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

type NotificationClient = Pick<GreenApi, 'receiveNotification' | 'deleteNotification'>;

export async function pollNotifications(
  api: NotificationClient,
  signal: AbortSignal,
  onMessage: (message: IncomingMessage) => void,
  onStatus: (status: ConnectionStatus) => void,
): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const notification = await api.receiveNotification(signal);
      if (signal.aborted) break;
      if (notification) {
        const incoming = parseIncoming(notification.body);
        if (incoming) onMessage(incoming);
        // Unsupported events must also be acknowledged so they do not block FIFO.
        await api.deleteNotification(notification.receiptId, signal);
      }
      failures = 0;
      onStatus({ kind: 'connected' });
      // Also avoid a tight loop if an upstream gateway returns null immediately.
      if (!notification) await abortableDelay(250, signal);
    } catch (error) {
      if (signal.aborted) break;
      if (error instanceof ApiError && error.kind === 'auth') {
        onStatus({ kind: 'stopped', message: error.message });
        return;
      }
      failures += 1;
      onStatus({
        kind: 'reconnecting',
        message:
          error instanceof ApiError
            ? error.message
            : 'Соединение прервано. Пробуем подключиться снова.',
      });
      try {
        await abortableDelay(Math.min(1000 * 2 ** Math.min(failures - 1, 5), 30_000), signal);
      } catch {
        break;
      }
    }
  }
}
