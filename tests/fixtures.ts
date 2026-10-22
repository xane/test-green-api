import type { Credentials, NotificationEnvelope } from '../src/types';

// Deliberately fake instance, key, names, IDs and phone numbers. Never real MAX data.
export const credentials: Credentials = {
  idInstance: '3100000000',
  apiTokenInstance: 'test-token-not-real',
  apiUrl: 'https://3100.api.green-api.com',
};

export function incoming(
  id = 'incoming-1',
  chatId = '10000001',
  text = 'Привет из теста!',
): NotificationEnvelope {
  return {
    receiptId: 101,
    body: {
      typeWebhook: 'incomingMessageReceived',
      idMessage: id,
      timestamp: 1792662000,
      senderData: {
        chatId,
        chatType: 'user',
        chatName: 'Тестовый собеседник',
        senderPhoneNumber: 79000000001,
      },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
    },
  };
}

export function pendingRequest(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
  });
}
