// routes/v1/session.routes.ts
import { v4 as uuidv4 } from 'uuid';

import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';

import mongoose from 'mongoose';
import SessionModel from '../common/src/mongoose-schemas/v1/session.schema';
import logger from '../common/src/utils/logger';
import Session from '../common/src/models/session.model';
import AnswerModel from '../common/src/mongoose-schemas/v1/answer.schema';
import QuestionCollectionModel from '../common/src/mongoose-schemas/v1/questionCollection.schema';
import QuestionModel from '../common/src/mongoose-schemas/v1/question.schema';

interface JWTPayload {
  ownerId: string;
  isAnonymous: boolean;
  sessionCode: string;
  sessionId: string | mongoose.Types.ObjectId;
}

interface SessionData {
  id: string;
  sessionCode: string;
  questionCollectionIds: string[];
  isActive: boolean;
  sessionDescription: string;
  sessionName: string;
}

function filterSessionData(session: Session) {
  const filteredSessionData: SessionData = {
    id: session.id as string,
    sessionCode: session.sessionCode,
    questionCollectionIds: session.questionCollectionIds as string[],
    isActive: session.isActive as boolean,
    sessionDescription: session.sessionDescription as string,
    sessionName: session.sessionName as string,
  };

  return filteredSessionData;
}

interface SessionQuery {
  isActive: string;
}

function generateRandomSessionCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let sessionCode = '';

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    sessionCode += characters[randomIndex];
  }

  return sessionCode;
}

interface SessionParams {
  ownerId: string;
  sessionCode: string;
  allowAnonymous: boolean;
}

interface Payload {
  ownerId: string;
}

interface SessionBody {
  allowAnonymous: boolean;
  startingQuestionType: string;
}

export default function sessionRoutes(fastify: FastifyInstance, options: FastifyPluginOptions, done: () => void) {
  options = {
    ...options,
    onRequest: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          isActive: { type: 'string' },
        },
      },
    },
  };

  fastify.get<{ Querystring: SessionQuery }>('/session', options, async (request, reply) => {
    const isActive = request.query.isActive === 'true';
    console.log('Getting acrive sessions');
    console.log('isActive:', isActive);

    try {
      console.log(request.user);
      const ownerId: string = (request.user as JWTPayload).ownerId;
      console.log('Owner ID:', ownerId);
      let sessions;

      if (isActive) {
        sessions = await SessionModel.find({ ownerId, isActive: true });
      } else {
        sessions = await SessionModel.find({ ownerId });
      }
      const filteredSessions = sessions.map(session => filterSessionData(session));
      console.info('Sessions:', filteredSessions);
      reply.status(200).send(filteredSessions);
    } catch (error) {
      console.error('Error getting all sessions:', error);
      reply.status(500).send('Internal Server Error');
    }
  });

  fastify.get(
    '/session/:sessionId',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };
        logger.info(`Getting session with ID: ${sessionId}`);
        const session = (await SessionModel.findById(sessionId)) as Session;
        const filteredSession = filterSessionData(session);
        console.info('Filtered Session:', filteredSession);
        reply.status(200).send(filteredSession);
      } catch (error) {
        console.error('Error getting all sessions:', error);
        reply.status(500).send('Internal Server Error');
      }
    }
  );

  fastify.get(
    '/session/:sessionId/question/:questionId/answers/events',
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      const { sessionId, questionId } = request.params as { sessionId: string; questionId: string };

      const sendEvent = (data: any) => {
        const sseFormattedResponse = `data: ${JSON.stringify(data)}\n\n`;
        reply.raw.write(sseFormattedResponse);
      };

      sendEvent({ message: `Connected to /session/${sessionId}/question/${questionId}/answers/events over SSE` });

      const pipeline: any = [{ $match: { 'fullDocument.questionId': new mongoose.Types.ObjectId(questionId) } }];
      try {
        const changeStream = AnswerModel.watch(pipeline, { fullDocument: 'updateLookup' });

        changeStream.on('change', (change: any) => {
          if (change.operationType === 'update' || change.operationType === 'insert') {
            const { content } = change.fullDocument;
            logger.info('on change', content);
            sendEvent({ content });
          }
        });

        changeStream.on('error', (error: any) => {
          console.error('Change Stream Error:', error);
        });

        request.raw.on('close', () => {
          changeStream.close();
          reply.raw.end();
          console.log('Connection closed');
        });
      } catch (error) {
        console.error('Error setting up change stream:', error);
        reply.raw.end();
      }
    }
  );

  fastify.post(
    '/session',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      console.log('createSession controller');
      const payload = request.user as Payload;
      const sessionBody = request.body as SessionBody;

      const randomSessionCode = generateRandomSessionCode();

      const sessionData = {
        ownerId: payload.ownerId,
        allowAnonymous: sessionBody.allowAnonymous,
        sessionCode: randomSessionCode,
      };

      console.log('sessionData', sessionData);

      try {
        console.log('Creating sessions');
        const session = await SessionModel.create(sessionData);
        console.log('Session created');

        console.log('Creating question collection');
        const questionCollection = await QuestionCollectionModel.create({
          sessionId: session._id,
        });
        console.log('Question collection created');

        console.log('Creating Quesiton Model');
        const startingQuestion = await QuestionModel.create({
          questionCollectionId: questionCollection._id,
          questionData: { questionType: sessionBody.startingQuestionType },
        });
        console.log('Question Model Created');

        await QuestionCollectionModel.findOneAndUpdate(
          { _id: questionCollection._id },
          { $set: { questionsIds: [startingQuestion._id] } }
        );

        const updatedSession = await SessionModel.findOneAndUpdate(
          { _id: session._id },
          { $push: { questionCollectionIds: questionCollection._id } },
          { new: true }
        );

        reply.status(201).send(updatedSession);
      } catch (error) {
        console.error('Error creating session:', error);
        reply.status(500).send('Internal Server Error');
      }
    }
  );

  /**
   * Get session based on session code
   *
   * This route handles the request from anonymous and authenticated users to join a session.
   * If the session allows for anonymous users, the route will generate a JWT for the user.
   */
  fastify.post('/session/:sessionCode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionCode } = request.params as { sessionCode: string };
    console.log('Session code:', sessionCode);

    try {
      const session = await SessionModel.findOne({ sessionCode });

      if (!session) {
        return reply.status(404).send('Session not found');
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (token && token !== '') {
        handleSessionWithToken(token, session, reply);
      } else {
        handleSessionWithoutToken(session, reply);
      }
    } catch (error) {
      console.error('Error joining session:', error);
      reply.status(500).send('Internal Server Error');
    }
  });

  fastify.post(
    '/session/:id/start',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userIdentifier = (request.user as JWTPayload).ownerId;
      const { session } = request.body as { session: { sessionDescription?: string; sessionName?: string } };
      const { question } = request.body as { question: { title: string; description: string } };

      const sessionDescription = session?.sessionDescription ?? 'Default Description';
      const sessionName = session?.sessionName ?? 'Default Name';
      const questionTitle = question?.title ?? 'Default Title';
      const questionDescription = question?.description ?? 'Default Description';

      try {
        const session = await SessionModel.findOneAndUpdate(
          { _id: id, ownerId: userIdentifier },
          { $set: { isActive: true, sessionDescription, sessionName } },
          { new: true }
        );

        if (!session) {
          return reply.status(404).send('Session not found');
        }

        if (questionTitle && questionDescription && session && session.questionCollectionIds) {
          const questionCollection = await QuestionCollectionModel.findById(session.questionCollectionIds[0]);

          const question = await QuestionModel.findOneAndUpdate(
            { _id: questionCollection?.questionsIds[0] },
            { $set: { title: questionTitle, description: questionDescription } },
            { new: true }
          );

          console.log('Updated question:', question);
        }

        console.log('Updated session:', session);

        reply.status(200).send(filterSessionData(session));
      } catch (error) {
        console.error('Error joining session:', error);
        reply.status(500).send('Internal Server Error');
      }
    }
  );

  /**
   * Handles the case where the user does not provide a token.
   * If the session allows anonymous users, the route will generate a JWT for the user.
   *
   * @param session the session to join
   * @param reply fastify reply object
   * @returns the response to the user
   */
  function handleSessionWithoutToken(session: Session, reply: FastifyReply) {
    if (session.allowAnonymous) {
      const userIdentifier = uuidv4();
      const payload: JWTPayload = {
        ownerId: userIdentifier,
        isAnonymous: true,
        sessionCode: session.sessionCode,
        sessionId: session.id,
      };
      const anonJwt = fastify.jwt.sign(payload);
      const filteredSessionData = filterSessionData(session);
      reply.status(200).send({ session: filteredSessionData, anonJwt });
    } else {
      console.log(`Anonymous user trying to join session ${session.sessionCode} which does not allow anonymous users`);
      return reply.status(403).send('Anonymous users not allowed');
    }
  }

  /**
   * Handles the case where the user provides a token.
   * If the token is valid, the route will return the session data.
   *
   * @param token the JWT token provided by the user
   * @param session the session to join
   * @param reply the fastify reply object
   * @returns the response to the user
   */
  function handleSessionWithToken(token: string, session: Session, reply: FastifyReply) {
    const payload: JWTPayload = fastify.jwt.verify<JWTPayload>(token);

    if (payload.isAnonymous && !session.allowAnonymous) {
      console.log(`Anonymous user trying to join session ${session.sessionCode} which does not allow anonymous users`);
      return reply.status(403).send('Anonymous users not allowed');
    }

    if (payload.sessionCode !== session.sessionCode) {
      const userIdentifier = uuidv4();
      const payload: JWTPayload = {
        ownerId: userIdentifier,
        isAnonymous: true,
        sessionCode: session.sessionCode,
        sessionId: session.id,
      };
      const anonJwt = fastify.jwt.sign(payload);
      const filteredSessionData = filterSessionData(session);
      reply.status(200).send({ session: filteredSessionData, anonJwt });
    }

    const filteredSessionData = filterSessionData(session);
    reply.status(200).send({ session: filteredSessionData });
  }

  done();
}
