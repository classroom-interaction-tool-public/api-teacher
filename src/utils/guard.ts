// utils/guard.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../common/src/utils/logger';

interface UserPayload {
  id: number;
  email: string;
  role: string;
}

export async function verifyJwtMiddleware(request: FastifyRequest, reply: FastifyReply) {
  logger.info('Verifying JWT');

  try {
    const user = await request.jwtVerify();
    request.user = user;
    logger.info(`User: ${JSON.stringify(user)} is verified`);
  } catch (err) {
    logger.error('JWT verification failed:', err);
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  console.log('JWT verified');
}

async function checkUserRole(request: FastifyRequest, role: string) {
  console.log('Checking user role');
  console.log('Request user:', request.user);
  console.log('Role:', role);

  const user = request.user as UserPayload;
  return user && user.role === role;
}

export const withAuth = (handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await verifyJwtMiddleware(request, reply);
    return handler(request, reply);
  };
};

export const withRole = (role: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await verifyJwtMiddleware(request, reply);

    if (await checkUserRole(request, role)) {
      return handler(request, reply);
    } else {
      console.log('User does not have the required role');
      console.log('Replying with 403');
      reply.code(403).send({ error: 'Forbidden' });
    }
  };
};
