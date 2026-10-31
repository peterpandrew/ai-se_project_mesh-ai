import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { logger } from './middleware/logger.js';
import router from './routes/index.js';

const app = express();

app.use(express.json());
app.use(logger);
app.use(router);

app.get('/health', (req, res): void => {
  res.status(200).json({
    success: true,
    data: { status: 'ok' },
    error: null,
  });
});

app.get('/test-error', () => {
  throw new Error('Test error');
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
