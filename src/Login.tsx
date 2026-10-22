import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage, GreenApi } from './api';
import { Icon } from './Icon';

export function Login({ onConnect }: { onConnect: (api: GreenApi) => void }) {
  const [idInstance, setId] = useState('');
  const [token, setToken] = useState('');
  const [apiUrl, setUrl] = useState('https://3100.api.green-api.com');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const api = new GreenApi({ idInstance, apiTokenInstance: token, apiUrl });
      await api.connect(controller.signal);
      if (!controller.signal.aborted) onConnect(api);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <header className="login-nav">
        <a className="brand" href="/" aria-label="MAX Chat, главная">
          <span className="brand-symbol">
            <Icon name="chat" size={24} />
          </span>
          MAX
          <span className="brand-divider" /> <span className="brand-caption">GREEN-API CHAT</span>
        </a>
        <a
          className="quiet-link"
          href="https://green-api.com/v3/docs/"
          target="_blank"
          rel="noreferrer"
        >
          Документация <Icon name="arrow" size={16} />
        </a>
      </header>
      <div className="login-layout">
        <section className="login-intro">
          <div className="eyebrow">
            <span className="green-dot" /> ПРОСТО БУДЬТЕ НА СВЯЗИ
          </div>
          <h1>
            Разговор начинается
            <br />с одного <span>привет.</span>
          </h1>
          <p className="intro-text">
            Ваши сообщения в MAX.
            <br />В простом и привычном интерфейсе.
          </p>
          <div className="conversation-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-note note-one">
              <span className="tiny-avatar">А</span>
              <div>
                Привет! Ты на связи?<small>12:40</small>
              </div>
            </div>
            <div className="art-note note-two">
              <div>
                Да, привет! 👋
                <small>
                  12:41 <Icon name="check" size={12} />
                </small>
              </div>
            </div>
            <div className="art-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="intro-footer">
            <Icon name="shield" size={18} />
            <span>Без сохранения ключей и истории на устройстве</span>
          </div>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <div className="card-mark">
            <Icon name="chat" size={27} />
          </div>
          <h2 id="login-title">Подключить MAX</h2>
          <p className="muted">Введите реквизиты инстанса GREEN-API</p>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="instance">
              ID инстанса <span>idInstance</span>
            </label>
            <input
              id="instance"
              name="instance"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Например, 3100000000"
              value={idInstance}
              onChange={(event) => setId(event.target.value)}
              required
              disabled={busy}
            />
            <label htmlFor="token">
              API-токен <span>apiTokenInstance</span>
            </label>
            <input
              id="token"
              name="token"
              type="password"
              autoComplete="off"
              placeholder="Ваш ключ доступа"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              disabled={busy}
              spellCheck={false}
            />
            <details className="api-settings">
              <summary>
                Адрес API <span>из личного кабинета</span>
              </summary>
              <label htmlFor="api-url" className="sr-only">
                apiUrl
              </label>
              <input
                id="api-url"
                name="api-url"
                type="url"
                value={apiUrl}
                onChange={(event) => setUrl(event.target.value)}
                required
                disabled={busy}
              />
              <p>Скопируйте apiUrl своего инстанса. Адрес зависит от кластера.</p>
            </details>
            {error && (
              <p role="alert" className="error-box">
                <Icon name="alert" size={18} />
                {error}
              </p>
            )}
            <button className="primary connect-button" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" /> Проверяем подключение
                </>
              ) : (
                <>
                  Начать общение <Icon name="arrow" size={19} />
                </>
              )}
            </button>
          </form>
          <p className="login-help">
            Ещё нет инстанса?{' '}
            <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">
              Открыть GREEN-API ↗
            </a>
          </p>
          <div className="privacy-note">
            <Icon name="shield" size={18} />
            <p>
              Ключ используется только для запросов к GREEN-API и хранится в памяти этой вкладки.
            </p>
          </div>
        </section>
      </div>
      <footer className="login-footer">
        <span>Текстовый чат · React + TypeScript</span>
        <span>Работает через GREEN-API</span>
      </footer>
    </main>
  );
}
