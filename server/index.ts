import { createApp } from './app.ts';

const { app, store } = await createApp({ logger: true });
const port = Number(process.env.PORT ?? 4310);
await app.listen({ host: '127.0.0.1', port });
console.log(`\nSan Germán: http://127.0.0.1:${port}\nDatos: ${store.filename}\n`);
const backupTimer = setInterval(
  () => {
    try {
      store.dailyBackup();
    } catch (error) {
      app.log.error(error, 'No se pudo crear la copia automática.');
    }
  },
  60 * 60 * 1000,
);
backupTimer.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    clearInterval(backupTimer);
    await app.close();
    process.exit(0);
  });
