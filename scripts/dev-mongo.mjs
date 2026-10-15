// Sobe um MongoDB local para desenvolvimento (baixa o binário na primeira vez).
// Os dados ficam em .devdata/mongo e sobrevivem entre execuções.
import { mkdirSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = new URL('../.devdata/mongo', import.meta.url).pathname;
mkdirSync(dbPath, { recursive: true });
const port = Number(process.env.MONGO_PORT ?? 27017);

const server = await MongoMemoryServer.create({ instance: { port, dbPath, storageEngine: 'wiredTiger' } });
console.log(`MongoDB de desenvolvimento em ${server.getUri()}  (dados em ${dbPath})`);
console.log('Use MONGODB_URI=mongodb://127.0.0.1:' + port + ' nos apps. Ctrl+C para parar.');

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
