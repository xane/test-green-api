import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { errorMessage } from './api';
import { useChat } from './context';
import { Icon } from './Icon';
import type { Message } from './types';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.startsWith('+') ? name.slice(-2) : name.trim().slice(0, 2).toUpperCase();
  return (
    <span className={`avatar${large ? ' avatar-large' : ''}`} aria-hidden="true">
      {initials}
    </span>
  );
}

function NewChat({ onClose }: { onClose: () => void }) {
  const { openChat } = useChat();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      request.current?.abort();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      await openChat(phone, controller.signal);
      if (!controller.signal.aborted) onClose();
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(errorMessage(error));
        setBusy(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="new-chat-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="dialog-heading">
        <span className="card-mark">
          <Icon name="chat" />
        </span>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <h2 id={titleId}>Новый разговор</h2>
      <p className="muted">Введите номер человека, которому хотите написать.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="recipient-phone">Телефон получателя</label>
        <input
          id="recipient-phone"
          type="tel"
          autoComplete="off"
          placeholder="+7 (900) 000-00-00"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={busy}
          required
        />
        <p className="field-hint">Номера России (+7) и Беларуси (+375)</p>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <button type="submit" className="primary connect-button" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> Ищем в MAX
            </>
          ) : (
            <>
              Создать чат <Icon name="arrow" size={18} />
            </>
          )}
        </button>
      </form>
    </dialog>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`message-row ${message.direction}`}>
      <div className={`message-bubble ${message.status === 'uncertain' ? 'uncertain' : ''}`}>
        <p>{message.text}</p>
        <div className="message-meta">
          <time dateTime={new Date(message.timestamp).toISOString()}>
            {timeFormat.format(message.timestamp)}
          </time>
          {message.direction === 'outgoing' && (
            <span
              title={
                message.status === 'accepted'
                  ? 'Принято GREEN-API; доставка не подтверждена'
                  : message.status === 'pending'
                    ? 'Ожидание ответа API'
                    : 'Приём не подтверждён'
              }
              aria-label={
                message.status === 'accepted'
                  ? 'Принято API'
                  : message.status === 'pending'
                    ? 'Ожидание ответа API'
                    : 'Приём не подтверждён'
              }
            >
              {message.status === 'pending' ? (
                <span className="spinner tiny" />
              ) : (
                <Icon name={message.status === 'accepted' ? 'check' : 'alert'} size={14} />
              )}
            </span>
          )}
        </div>
        {message.status === 'uncertain' && (
          <small className="uncertain-label">Приём не подтверждён</small>
        )}
      </div>
    </div>
  );
}

function Conversation() {
  const { state, dispatch, send } = useChat();
  const chat = state.chats.find((item) => item.id === state.activeChatId);
  const messages = chat ? state.messages[chat.id] || [] : [];
  const draft = chat ? state.drafts[chat.id] || '' : '';
  const busy = messages.some((message) => message.status === 'pending');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const lastMessage = messages.at(-1)?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [chat?.id, lastMessage]);
  if (!chat)
    return (
      <section className="conversation empty-conversation" aria-label="Переписка">
        <div className="empty-symbol">
          <Icon name="chat" size={40} />
        </div>
        <h2>Место для вашего разговора</h2>
        <p>
          Выберите чат слева или начните новый.
          <br />
          Иногда достаточно одного «привет».
        </p>
        <span className="empty-tag">
          <span className="green-dot" /> MAX через GREEN-API
        </span>
      </section>
    );

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (
      !chat ||
      busy ||
      !draft.trim() ||
      draft.length > 4000 ||
      state.connection.kind === 'stopped'
    )
      return;
    const chatId = chat.id;
    setErrors((previous) => ({ ...previous, [chatId]: '' }));
    try {
      await send(chatId, draft);
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [chatId]: `${errorMessage(error)} Приём сообщения не подтверждён. Перед повторной отправкой проверьте MAX: сообщение могло уйти.`,
      }));
    }
  }
  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section className="conversation" aria-label="Переписка">
      <header className="conversation-header">
        <button
          className="icon-button mobile-back"
          aria-label="Назад к чатам"
          onClick={() => dispatch({ type: 'select', id: null })}
        >
          <Icon name="back" />
        </button>
        <Avatar name={chat.name} />
        <div className="conversation-person">
          <h2>{chat.name}</h2>
          <span>Текстовые сообщения · MAX</span>
        </div>
        <span className="session-badge">Текущая сессия</span>
      </header>
      <div
        className="message-history"
        role="log"
        aria-label="Сообщения"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <div className="first-message">
            <Icon name="chat" size={28} />
            <h3>Начните с приветствия</h3>
            <p>Здесь появятся ваши сообщения и ответы собеседника.</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={message.id}>
              {(index === 0 ||
                dateFormat.format(messages[index - 1].timestamp) !==
                  dateFormat.format(message.timestamp)) && (
                <div className="date-separator">
                  <span>{dateFormat.format(message.timestamp)}</span>
                </div>
              )}
              <MessageBubble message={message} />
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        {errors[chat.id] && (
          <p className="error-box send-error" role="alert">
            {errors[chat.id]}
          </p>
        )}
        <form className="composer" onSubmit={(event) => void submit(event)}>
          <label className="sr-only" htmlFor="message">
            Сообщение
          </label>
          <textarea
            id="message"
            rows={1}
            placeholder="Написать сообщение…"
            value={draft}
            onChange={(event) =>
              dispatch({ type: 'draft', chatId: chat.id, text: event.target.value })
            }
            onKeyDown={handleKey}
            disabled={busy || state.connection.kind === 'stopped'}
          />
          <button
            className="send-button"
            type="submit"
            aria-label="Отправить сообщение"
            disabled={
              busy || !draft.trim() || draft.length > 4000 || state.connection.kind === 'stopped'
            }
          >
            {busy ? <span className="spinner" /> : <Icon name="send" size={23} />}
          </button>
        </form>
        <div className="composer-hint">
          <span>Enter — отправить · Shift+Enter — новая строка</span>
          <span className={draft.length > 4000 ? 'text-danger' : ''}>{draft.length} / 4000</span>
        </div>
      </div>
    </section>
  );
}

export function Chat({ onLogout, instanceId }: { onLogout: () => void; instanceId: string }) {
  const { state, dispatch } = useChat();
  const [newChat, setNewChat] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = state.chats.filter((chat) =>
    `${chat.name} ${chat.phone || ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="chat-page">
      <div className={`chat-shell${state.activeChatId ? ' has-active-chat' : ''}`}>
        <aside className="sidebar" aria-label="Список чатов">
          <div className="sidebar-heading">
            <div className="brand">
              <span className="brand-symbol">
                <Icon name="chat" size={23} />
              </span>
              <span>
                MAX<span className="brand-subtitle">GREEN-API CHAT</span>
              </span>
            </div>
            <button
              className="new-chat-button icon-button"
              aria-label="Новый чат"
              title="Новый чат"
              onClick={() => setNewChat(true)}
            >
              <Icon name="plus" />
            </button>
          </div>
          <div className="sidebar-title">
            <h1>Сообщения</h1>
            <span>{state.chats.length}</span>
          </div>
          <div className="search-field">
            <Icon name="search" size={18} />
            <input
              aria-label="Найти чат"
              placeholder="Поиск"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="chat-list">
            {filtered.length ? (
              filtered.map((chat) => {
                const last = state.messages[chat.id]?.at(-1);
                return (
                  <button
                    key={chat.id}
                    className={`chat-item${state.activeChatId === chat.id ? ' active' : ''}`}
                    onClick={() => dispatch({ type: 'select', id: chat.id })}
                    aria-label={`Открыть чат ${chat.name}`}
                    aria-current={state.activeChatId === chat.id ? 'true' : undefined}
                  >
                    <Avatar name={chat.name} />
                    <span className="chat-item-copy">
                      <span className="chat-item-top">
                        <strong>{chat.name}</strong>
                        {last && <time>{timeFormat.format(last.timestamp)}</time>}
                      </span>
                      <span className="chat-item-bottom">
                        <span>
                          {last
                            ? `${last.direction === 'outgoing' ? 'Вы: ' : ''}${last.text}`
                            : 'Начните разговор'}
                        </span>
                        {chat.unread > 0 && (
                          <span
                            className="unread-badge"
                            aria-label={`${chat.unread} непрочитанных`}
                          >
                            {chat.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="sidebar-empty">
                <span className="sidebar-empty-icon">
                  <Icon name="chat" size={27} />
                </span>
                <h2>{search ? 'Ничего не найдено' : 'Пока тихо'}</h2>
                <p>
                  {search
                    ? 'Попробуйте другое имя или номер.'
                    : 'Добавьте собеседника, чтобы начать общение.'}
                </p>
                {!search && (
                  <button className="text-button" onClick={() => setNewChat(true)}>
                    Начать разговор <Icon name="plus" size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="sidebar-footer">
            <div className="connection-line" role="status">
              <span className={`status-dot ${state.connection.kind}`} />
              <span>
                {state.connection.kind === 'connected'
                  ? 'Подключено'
                  : state.connection.kind === 'reconnecting'
                    ? 'Восстанавливаем связь'
                    : 'Приём остановлен'}
              </span>
            </div>
            <div className="instance-line">
              <span>Инстанс {instanceId}</span>
              <button
                className="icon-button"
                aria-label="Выйти"
                title="Выйти и очистить сессию"
                onClick={onLogout}
              >
                <Icon name="logout" size={18} />
              </button>
            </div>
          </footer>
        </aside>
        <div className="conversation-column">
          {state.connection.kind !== 'connected' && (
            <div className={`connection-banner ${state.connection.kind}`} role="alert">
              <Icon name="alert" size={18} />
              <span>
                {state.connection.message}
                {state.connection.kind === 'stopped' && ' Выйдите и подключитесь заново.'}
              </span>
            </div>
          )}
          <Conversation />
        </div>
      </div>
      <p className="app-footnote">
        <Icon name="shield" size={13} /> Сообщения и ключи остаются только в памяти вкладки
      </p>
      {newChat && <NewChat onClose={() => setNewChat(false)} />}
    </main>
  );
}
