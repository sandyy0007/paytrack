import { createApp } from './app';
import { config } from './config';
import { createPool } from './db';
import { migrate } from './migrate';

const db = createPool();
await migrate(db);
const server = createApp(db).listen(config.port, () => console.log(`PayTrack API listening on :${config.port}`));

const shutdown = () => {
  server.close(() => db.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
