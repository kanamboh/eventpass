import app from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/config/logger.js';
import { connectDatabase, prisma } from './src/config/db.js';

const startServer = async () => {
  try {
    // 1. Verify database connection
    await connectDatabase();

    // 2. Start HTTP server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 EventPass Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`👉 Health endpoint: http://localhost:${env.PORT}/api/health`);
    });

    // 3. Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await prisma.$disconnect();
          logger.info('Database connection closed.');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error during database disconnect');
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds if graceful close hangs
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
