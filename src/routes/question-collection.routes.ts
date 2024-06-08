import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import mongoose from 'mongoose';
import QuestionCollectionModel from '../common/src/mongoose-schemas/v1/questionCollection.schema';

export default function questionCollectionRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
  done: () => void
) {
  fastify.get(
    '/session/:sid/question-collection/:qcid',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sid, qcid } = request.params as { sid: string; qcid: string };

      const results = await QuestionCollectionModel.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(qcid), sessionId: new mongoose.Types.ObjectId(sid) } },
        {
          $lookup: {
            from: 'questions',
            localField: 'questionsIds',
            foreignField: '_id',
            as: 'questions',
          },
        },
      ]);

      if (!results || results.length === 0) {
        return reply.status(404).send('Question Collection not found');
      }

      reply.send(results[0]);
    }
  );

  done();
}
