import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ROOMS, money } from '../shared/domain.ts';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/#reservas',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
class LocalChannel {
  postMessage() {}
  close() {}
  onmessage = null;
}
Object.assign(globalThis, { BroadcastChannel: LocalChannel });
const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { App } = await import('../src/App.tsx');
const reservation = {
  id: 'test',
  number: 1,
  guestName: 'Prueba del panel',
  document: '',
  phone: '',
  email: '',
  fiscalData: '',
  bookedOn: '2026-11-03',
  pax: 1,
  lodgingCents: 10000,
  state: 'confirmed',
  channel: 'direct',
  visualTag: 'auto',
  notes: '',
  assignments: [{ roomId: 1, checkIn: '2026-11-03', checkOut: '2026-11-05' }],
  checkIn: '2026-11-03',
  checkOut: '2026-11-05',
  version: 1,
  paidCents: 0,
  consumptionCents: 0,
  lodgingPaidCents: 0,
  consumptionPaidCents: 0,
  balanceCents: 10000,
  paidByMethod: { cash: 0, transfer: 0, card: 0 },
};
const detail = { reservation, consumptions: [], payments: [], history: [] };
const bootstrap = {
  today: '2026-11-03',
  rooms: ROOMS,
  reservations: [reservation],
  consumptions: [],
  sessions: [],
  movements: [],
  products: [],
  pendingImports: 0,
  dataPath: 'test.sqlite',
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
async function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  assert.ok(button, selector);
  await act(async () => button.click());
}
async function mount(fetcher: typeof fetch) {
  globalThis.fetch = fetcher;
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(createElement(App)));
  await click('.guest-link');
  await click('[aria-label="Editar reserva"]');
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.match(document.querySelector('[role="dialog"]')!.textContent!, /Editar reserva/);
  return root;
}
test('editar reemplaza la cuenta y ambos paneles se pueden cerrar sin recargar', async () => {
  const originalFetch = globalThis.fetch;
  const root = await mount(async (path) =>
    response(String(path).endsWith('/bootstrap') ? bootstrap : detail),
  );
  try {
    await click('[aria-label="Cerrar"]');
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assert.ok(document.querySelector('.drawer'));
    await click('[aria-label="Cerrar"]');
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 0);
    assert.equal(document.body.style.overflow, '');
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});
test('guardar con una respuesta tardía no vuelve a abrir una cuenta cerrada', async () => {
  const originalFetch = globalThis.fetch;
  let saved = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const root = await mount(async (path, options) => {
    if (options?.method === 'PUT') {
      saved = true;
      return response(detail);
    }
    if (String(path).endsWith('/bootstrap')) {
      if (saved) await pending;
      return response(bootstrap);
    }
    return response(detail);
  });
  try {
    await act(async () => {
      document
        .querySelector('form')!
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.ok(saved);
    assert.ok(document.querySelector('.drawer'));
    await click('[aria-label="Cerrar"]');
    await act(async () => {
      release();
      await pending;
    });
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 0);
    assert.equal(document.body.style.overflow, '');
  } finally {
    release();
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});

test('el cobro permite ingresar una seña y muestra el saldo restante', async () => {
  const originalFetch = globalThis.fetch;
  let current = { ...reservation };
  let payment: Record<string, unknown> | undefined;
  const root = await mount(async (path, options) => {
    if (options?.method === 'POST' && String(path).endsWith('/payments')) {
      payment = JSON.parse(String(options.body));
      current = {
        ...current,
        lodgingPaidCents: 3000,
        paidCents: 3000,
        balanceCents: 7000,
        version: 2,
        paidByMethod: { cash: 3000, transfer: 0, card: 0 },
      };
    }
    return response(
      String(path).endsWith('/bootstrap')
        ? {
            ...bootstrap,
            reservations: [current],
            sessions: [{ id: 'cash', date: '2026-11-03', closedAt: null }],
          }
        : { ...detail, reservation: current },
    );
  });
  try {
    await click('[aria-label="Cerrar"]');
    await click('.account-balance button');
    const amount = document.querySelector<HTMLInputElement>('[aria-label="Importe en pesos"]')!;
    assert.equal(amount.value, '');
    assert.ok(document.querySelector<HTMLInputElement>('input[value="partial"]')!.checked);
    await click('input[value="balance"]');
    assert.equal(amount.value, '100');
    await click('input[value="partial"]');
    assert.equal(amount.value, '');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(
        amount,
        '30',
      );
      amount.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.ok(document.querySelector('.form-total')!.textContent!.includes(money(7000)));
    await act(async () => {
      document
        .querySelector('form')!
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(payment?.amountCents, 3000);
    assert.equal(payment?.allocation, 'lodging');
    assert.equal(document.querySelector('.account-balance strong')!.textContent, money(7000));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});
