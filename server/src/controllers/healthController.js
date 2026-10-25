import { prisma } from '../config/db.js';

export const getHealth = async (req, res, next) => {
  try {
    // Perform a lightweight database ping without leaking credentials
    await prisma.$queryRaw`SELECT 1`;
    
    return res.status(200).json({
      status: 'ok'
    });
  } catch (error) {
    // Do not leak database credentials, connection strings, or stack traces
    return res.status(503).json({
      status: 'degraded',
      message: 'Service is experiencing database connectivity issues'
    });
  }
};
