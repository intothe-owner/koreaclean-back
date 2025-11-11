// src/server.ts
import express from 'express';
import http from 'http';
import cors from 'cors';
import chatRouter from './routes/chat';
const { sequelize } = require('../models');
import { attachSocket } from './socket';

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/chat', chatRouter);

  const server = http.createServer(app);
  attachSocket(server);

  const PORT = process.env.PORT || 4000;

  await sequelize.authenticate();
  // 개발 초기에만 sync 옵션 사용 고려
  // await sequelize.sync({ alter: true });

  server.listen(PORT, () => {
    console.log(`Chat API running on :${PORT}`);
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
