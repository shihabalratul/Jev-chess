import 'dotenv/config';
import { buildServer } from './app';
const app = await buildServer({ logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? '127.0.0.1' });
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => { void app.close().then(() => process.exit(0)); });
