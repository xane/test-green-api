import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { ApiError, normalizePhone } from './api';
import type { GreenApi } from './api';
import { ChatContext } from './context';
import { pollNotifications } from './notifications';
import { chatReducer, initialState } from './state';

export function ChatProvider({ api, children }: { api: GreenApi; children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const lifetime = useRef<AbortController | null>(null);
  const sending = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void pollNotifications(
      api,
      controller.signal,
      (incoming) => dispatch({ type: 'incoming', incoming }),
      (status) => dispatch({ type: 'connection', status }),
    );
    return () => {
      controller.abort();
    };
  }, [api]);

  const openChat = useCallback(
    async (input: string, actionSignal?: AbortSignal) => {
      const phone = normalizePhone(input);
      const sessionSignal = lifetime.current?.signal ?? AbortSignal.abort();
      const signal = actionSignal ? AbortSignal.any([sessionSignal, actionSignal]) : sessionSignal;
      try {
        const id = await api.checkAccount(phone, signal);
        if (!signal.aborted) dispatch({ type: 'open', chat: { id, phone, name: `+${phone}` } });
      } catch (error) {
        if (!signal.aborted && error instanceof ApiError && error.kind === 'auth') {
          dispatch({ type: 'connection', status: { kind: 'stopped', message: error.message } });
          lifetime.current?.abort();
        }
        throw error;
      }
    },
    [api],
  );

  const send = useCallback(
    async (chatId: string, text: string) => {
      if (sending.current.has(chatId)) return;
      const signal = lifetime.current?.signal ?? AbortSignal.abort();
      const temporaryId = `local:${crypto.randomUUID()}`;
      sending.current.add(chatId);
      dispatch({
        type: 'pending',
        message: {
          id: temporaryId,
          chatId,
          text,
          timestamp: Date.now(),
          direction: 'outgoing',
          status: 'pending',
        },
      });
      try {
        const id = await api.sendMessage(chatId, text, signal);
        if (!signal.aborted)
          dispatch({ type: 'accepted', chatId, temporaryId, id, originalText: text });
      } catch (error) {
        if (!signal.aborted) {
          dispatch({ type: 'uncertain', chatId, temporaryId });
          if (error instanceof ApiError && error.kind === 'auth') {
            dispatch({ type: 'connection', status: { kind: 'stopped', message: error.message } });
            lifetime.current?.abort();
          }
        }
        throw error;
      } finally {
        sending.current.delete(chatId);
      }
    },
    [api],
  );

  return <ChatContext value={{ state, dispatch, openChat, send }}>{children}</ChatContext>;
}
