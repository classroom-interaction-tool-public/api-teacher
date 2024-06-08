// src/routes/v1/auth.routes.ts
import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';

import bcrypt from 'bcrypt';
import UserModel from '../common/src/mongoose-schemas/v1/user.schema';

const saltRounds = 10;

interface UserBody {
  email: string;
  password: string;
}

export default function authRoutes(fastify: FastifyInstance, options: FastifyPluginOptions, done: () => void) {
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as UserBody;

    if (!/.+\@.+\..+/.test(email)) {
      console.log(`Invalid email format: ${email}`);
      return reply.status(400).send('Invalid email format');
    }

    try {
      const userExists = await UserModel.exists({ email }).exec();
      if (userExists) {
        console.log(`User with email: ${email} already exists`);
        reply.send('User with email already exists').status(400);
        return;
      }

      const passwordHash: string = await bcrypt.hash(password, saltRounds);
      const newUser = new UserModel({
        email,
        passwordHash,
        role: 'teacher',
      });

      const savedUser = await newUser.save();

      if (!savedUser) {
        console.log(`Failed to save user: ${email}`);
        reply.send('Failed to save user').status(500);
        return;
      }

      console.log(`User created: ${email}`);
      console.log(`User: ${JSON.stringify(savedUser)}`);

      const accessToken = fastify.jwt.sign({ ownerId: savedUser._id });
      console.log(`Access token: ${accessToken}`);
      reply.send({ accessToken }).status(201);
    } catch (error) {
      console.log(`Failed to save user: ${email}`);
      reply.send('Failed to save user').status(500);
    }
  });

  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as UserBody;

    const user = await UserModel.findOne({ email }).exec();

    if (!user) {
      reply.send('Invalid email or password').status(400);
      return;
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      reply.send('Invalid email or password').status(400);
      return;
    }

    const payload = {
      ownerId: user.id,
    };

    console.log(`User logged in: ${email}`);
    console.log(`User identifier: ${user.id}`);

    const accessToken = fastify.jwt.sign(payload);

    return {
      data: { accessToken },
      message: 'User logged in',
      statusCode: 200,
    };
  });

  done();
}
