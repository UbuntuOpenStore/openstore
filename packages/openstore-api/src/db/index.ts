import mongoose from 'mongoose';

import { logger, config } from '../utils';

mongoose.connect(`${config.mongo.uri}/${config.mongo.database}`).catch((err) => {
  if (err) {
    logger.error('database error:', err);
    process.exit(1);
  }
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Closing MongoDB connection...`);
  try {
    await mongoose.connection.close();
    process.exit(0);
  }
  catch (err) {
    logger.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
