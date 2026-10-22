import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { incoming } from '../tests/fixtures';

const screenshotTime = new Date('2026-10-22T11:40:00Z');
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(screenshotTime);
});

async function mockApi(
  page: Page,
  { failSend = false, quotedReply = false, wrongInstance = false } = {},
) {
  let sent = 0;
  let acknowledged = false;
  const sendBodies: unknown[] = [];
  await page.route('https://*.api.green-api.com/**', async (route) => {
    const url = route.request().url();
    let json: unknown = null;
    if (url.includes('/getStateInstance/')) json = { stateInstance: 'authorized' };
    else if (url.includes('/getSettings/'))
      json = {
        typeInstance: wrongInstance ? 'whatsapp' : 'v3',
        incomingWebhook: 'yes',
        webhookUrl: '',
      };
    else if (url.includes('/checkAccount/')) json = { exist: true, chatId: '10000001' };
    else if (url.includes('/sendMessage/')) {
      sent++;
      sendBodies.push(route.request().postDataJSON());
      if (failSend) {
        await route.abort('failed');
        return;
      }
      json = { idMessage: `outgoing-${sent}` };
    } else if (url.includes('/receiveNotification/')) {
      // Repeat the same receipt until acknowledged, as the real queue does.
      if (sent && !acknowledged && !failSend) {
        const notification = incoming('incoming-1', '10000001', 'Привет! Да, всё работает.');
        if (quotedReply)
          notification.body.messageData = {
            typeMessage: 'quotedMessage',
            extendedTextMessageData: {
              text: 'Ответ через кнопку Ответить',
              stanzaId: 'outgoing-1',
              participant: '10000001',
            },
          };
        notification.body.timestamp = screenshotTime.getTime() / 1000 + 60;
        json = notification;
      }
    } else if (url.includes('/deleteNotification/')) {
      acknowledged = true;
      json = { result: true };
    } else
      throw new Error(`Unmocked API method: ${url.replace(/test-token-not-real/g, 'REDACTED')}`);
    await route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return { sendBodies, sent: () => sent, acknowledged: () => acknowledged };
}

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel(/ID инстанса/).fill('3100000000');
  await page.getByLabel(/API-токен/).fill('test-token-not-real');
  await page.getByRole('button', { name: /Начать общение/ }).click();
  await expect(page.getByRole('button', { name: 'Новый чат' })).toBeVisible();
}

async function createChat(page: Page) {
  await page.getByRole('button', { name: 'Новый чат' }).click();
  await page.getByLabel('Телефон получателя').fill('+7 (900) 000-00-01');
  await page.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible();
}

test('desktop: sends and receives, acknowledges the queue and renders only once', async ({
  page,
}) => {
  const api = await mockApi(page);
  await login(page);
  await createChat(page);
  await page
    .getByRole('textbox', { name: 'Сообщение', exact: true })
    .fill('Привет! Проверяем наш новый чат 👋');
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).press('Enter');
  await expect(
    page
      .getByRole('log', { name: 'Сообщения' })
      .getByText('Привет! Да, всё работает.', { exact: true }),
  ).toHaveCount(1);
  await expect.poll(api.acknowledged).toBe(true);
  expect(api.sendBodies).toEqual([
    { chatId: '10000001', message: 'Привет! Проверяем наш новый чат 👋' },
  ]);
  await expect(page.getByLabel('Принято API')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue('');
  await page.screenshot({ path: 'docs/chat-desktop.png', fullPage: true });
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByLabel(/API-токен/)).toHaveValue('');
});

test('network failure retains the draft and does not resend', async ({ page }) => {
  const api = await mockApi(page, { failSend: true });
  await login(page);
  await createChat(page);
  const composer = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  await composer.fill('Текст не должен потеряться');
  await composer.press('Enter');
  await expect(page.getByRole('alert')).toContainText('сообщение могло уйти');
  await expect(composer).toHaveValue('Текст не должен потеряться');
  expect(api.sent()).toBe(1);
});

test('a text reply with a quote is shown in the original conversation', async ({ page }) => {
  const api = await mockApi(page, { quotedReply: true });
  await login(page);
  await createChat(page);
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Сообщение для ответа');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(
    page
      .getByRole('log', { name: 'Сообщения' })
      .getByText('Ответ через кнопку Ответить', { exact: true }),
  ).toHaveCount(1);
  await expect.poll(api.acknowledged).toBe(true);
  await expect(page.getByRole('button', { name: /Открыть чат/ })).toHaveCount(1);
});

test('a WhatsApp instance cannot silently connect as MAX', async ({ page }) => {
  await mockApi(page, { wrongInstance: true });
  await page.goto('/');
  await page.getByLabel(/ID инстанса/).fill('3100000000');
  await page.getByLabel(/API-токен/).fill('test-token-not-real');
  await page.getByRole('button', { name: /Начать общение/ }).click();
  await expect(page.getByRole('alert')).toContainText('нужен инстанс MAX');
  await expect(page.getByRole('button', { name: 'Новый чат' })).toHaveCount(0);
});

test('mobile: list and conversation have separate screens, Shift+Enter keeps a newline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await createChat(page);
  await expect(page.getByRole('complementary', { name: 'Список чатов' })).toBeHidden();
  const composer = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  await composer.fill('Первая строка');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('Вторая строка');
  await expect(composer).toHaveValue('Первая строка\nВторая строка');
  await composer.fill('Привет!');
  await composer.press('Enter');
  await expect(
    page
      .getByRole('log', { name: 'Сообщения' })
      .getByText('Привет! Да, всё работает.', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/chat-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Назад к чатам' }).click();
  await expect(page.getByRole('complementary', { name: 'Список чатов' })).toBeVisible();
  await page.getByRole('button', { name: /Открыть чат Тестовый собеседник/ }).click();
  await expect(composer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('login screenshot uses no credentials or personal MAX data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Подключить MAX' })).toBeVisible();
  await page.screenshot({ path: 'docs/login.png', fullPage: true });
});
