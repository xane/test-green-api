import type { Credentials, NotificationEnvelope } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'network' | 'api' = 'api',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateCredentials(input: Credentials): Credentials {
  const idInstance = input.idInstance.trim();
  const apiTokenInstance = input.apiTokenInstance.trim();
  if (!/^\d+$/.test(idInstance)) throw new ApiError('idInstance должен состоять из цифр.');
  if (!/^[a-zA-Z0-9_-]+$/.test(apiTokenInstance)) {
    throw new ApiError('Введите apiTokenInstance из личного кабинета GREEN-API.');
  }
  let url: URL;
  try {
    url = new URL(input.apiUrl.trim());
  } catch {
    throw new ApiError('Укажите корректный apiUrl из личного кабинета.');
  }
  // A mistyped API host must not receive the user's token.
  if (
    url.protocol !== 'https:' ||
    !/^(\d+\.)?api\.green-api\.com$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(v3\/?)?$/.test(url.pathname)
  ) {
    throw new ApiError(
      'apiUrl должен быть HTTPS-адресом api.green-api.com или кластера, например 3100.api.green-api.com (допустим /v3).',
    );
  }
  return { idInstance, apiTokenInstance, apiUrl: url.href.replace(/\/$/, '') };
}

export function normalizePhone(value: string): string {
  if (!/^[+\d\s()-]+$/.test(value))
    throw new ApiError('Введите номер телефона, без букв и добавочного номера.');
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!/^(7\d{10}|375\d{9})$/.test(digits)) {
    throw new ApiError('Нужен номер РФ (+7, 11 цифр) или Беларуси (+375, 12 цифр).');
  }
  return digits;
}

export class GreenApi {
  readonly credentials: Credentials;
  constructor(credentials: Credentials) {
    this.credentials = validateCredentials(credentials);
  }

  private async request(
    method: string,
    verb: string,
    signal: AbortSignal,
    body?: unknown,
    suffix = '',
  ): Promise<unknown> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    const timer = new AbortController();
    const timeout = setTimeout(
      () => timer.abort(),
      method === 'receiveNotification' ? 35_000 : 15_000,
    );
    try {
      const response = await fetch(
        `${apiUrl}/waInstance${idInstance}/${method}/${encodeURIComponent(apiTokenInstance)}${suffix}`,
        {
          method: verb,
          signal: AbortSignal.any([signal, timer.signal]),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          ...(body !== undefined
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : {}),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        // MAX can restrict sending while the credentials and receiving still work.
        if (
          response.status === 403 &&
          method === 'sendMessage' &&
          text.includes('Your account is suspended')
        ) {
          throw new ApiError(
            'MAX временно ограничил отправку сообщений. Проверьте ограничения аккаунта в MAX.',
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new ApiError(
            'GREEN-API отклонил доступ. Проверьте реквизиты и состояние инстанса в кабинете.',
            'auth',
          );
        }
        if (response.status === 429 || response.status === 469)
          throw new ApiError('Достигнут лимит GREEN-API. Попробуйте позже.');
        throw new ApiError(
          `Ошибка GREEN-API (HTTP ${response.status}). Проверьте настройки инстанса.`,
        );
      }
      if (!text.trim()) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new ApiError('GREEN-API вернул ответ в неизвестном формате.');
      }
    } catch (error) {
      if (signal.aborted) throw new DOMException('Запрос отменён', 'AbortError');
      if (error instanceof ApiError) throw error;
      // Never echo fetch errors or URLs: they may contain the API token.
      throw new ApiError(
        timer.signal.aborted
          ? 'Превышено время ожидания GREEN-API.'
          : 'Не удалось связаться с GREEN-API. Проверьте сеть и apiUrl.',
        'network',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async connect(signal: AbortSignal): Promise<void> {
    const state = await this.request('getStateInstance', 'GET', signal);
    if (!isRecord(state) || typeof state.stateInstance !== 'string')
      throw new ApiError('Не удалось проверить состояние инстанса.');
    if (state.stateInstance !== 'authorized') {
      throw new ApiError(
        'Инстанс не авторизован или ещё не готов. Подключите MAX в кабинете GREEN-API и повторите вход.',
      );
    }
    const settings = await this.request('getSettings', 'GET', signal);
    if (
      !isRecord(settings) ||
      typeof settings.webhookUrl !== 'string' ||
      typeof settings.incomingWebhook !== 'string'
    ) {
      throw new ApiError('Не удалось проверить настройки уведомлений инстанса.');
    }
    if (settings.typeInstance !== 'v3') {
      throw new ApiError(
        'Для этого чата нужен инстанс MAX (typeInstance: v3). Выберите его реквизиты в кабинете GREEN-API.',
      );
    }
    if (settings.webhookUrl.trim() || settings.incomingWebhook !== 'yes') {
      throw new ApiError(
        'В кабинете GREEN-API очистите webhookUrl и включите входящие уведомления. Настройки применяются примерно минуту.',
      );
    }
  }

  async checkAccount(phone: string, signal: AbortSignal): Promise<string> {
    const result = await this.request('checkAccount', 'POST', signal, {
      phoneNumber: Number(phone),
    });
    if (!isRecord(result) || typeof result.exist !== 'boolean') {
      throw new ApiError(
        'Не удалось проверить номер. Убедитесь, что инстанс готов и лимит проверок не исчерпан.',
      );
    }
    if (!result.exist) throw new ApiError('На этом номере не найден аккаунт MAX.');
    if (typeof result.chatId !== 'string' || !result.chatId)
      throw new ApiError('GREEN-API не вернул идентификатор чата.');
    return result.chatId;
  }

  async sendMessage(chatId: string, message: string, signal: AbortSignal): Promise<string> {
    if (!message.trim() || message.length > 4000)
      throw new ApiError('Сообщение должно содержать от 1 до 4000 символов.');
    const result = await this.request('sendMessage', 'POST', signal, { chatId, message });
    if (!isRecord(result) || typeof result.idMessage !== 'string' || !result.idMessage)
      throw new ApiError('Не удалось подтвердить приём сообщения GREEN-API.');
    return result.idMessage;
  }

  async receiveNotification(signal: AbortSignal): Promise<NotificationEnvelope | null> {
    const result = await this.request(
      'receiveNotification',
      'GET',
      signal,
      undefined,
      '?receiveTimeout=25',
    );
    if (result === null) return null;
    if (
      !isRecord(result) ||
      typeof result.receiptId !== 'number' ||
      !Number.isSafeInteger(result.receiptId) ||
      result.receiptId <= 0 ||
      !isRecord(result.body)
    )
      throw new ApiError('Неизвестный формат уведомления GREEN-API.');
    return { receiptId: result.receiptId as number, body: result.body };
  }

  async deleteNotification(receiptId: number, signal: AbortSignal): Promise<void> {
    const result = await this.request(
      'deleteNotification',
      'DELETE',
      signal,
      undefined,
      `/${receiptId}`,
    );
    if (!isRecord(result) || result.result !== true)
      throw new ApiError('Не удалось подтвердить обработку уведомления.');
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Произошла ошибка. Попробуйте ещё раз.';
}
