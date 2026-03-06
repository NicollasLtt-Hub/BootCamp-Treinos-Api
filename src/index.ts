import "dotenv/config";

import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import z from "zod";

import { auth } from "./lib/auth.js";
import { aiRoutes } from "./routes/ai.js";
import { homeRoutes } from "./routes/home.js";
import { meRoutes } from "./routes/me.js";
import { statsRoutes } from "./routes/stats.js";
import { workoutPlanRoutes } from "./routes/workout-plan.js";

export const app = Fastify({
  logger: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Treinos API",
      description: "API para o bootcamp de treinos do FSC",
      version: "1.0.0",
    },
      servers: [
        {
          description: "Localhost",
          url: "http://127.0.0.1:8081",
        },
      ],
  },
  transform: jsonSchemaTransform,
});

//Preparo pro Front-End e para o playground de API (/docs)
await app.register(fastifyCors, {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:8081"],
  credentials: true,
});


await app.register(fastifyApiReference, {
  routePrefix: "/docs",
  configuration: {
    sources: [
      {
        title: "Bootcamp Treinos API",
        slug: "bootcamp-treinos-api",
        url: "/swagger.json",
      },
      {
        title: "Auth API",
        slug: "auth-api",
        url: "/api/auth/open-api/generate-schema",
      },
    ],
  },
});

// Routes
await app.register(workoutPlanRoutes, {prefix: "/workout-plan"});
await app.register(homeRoutes, {prefix: "/home"});
await app.register(statsRoutes, {prefix: "/stats"});
await app.register(meRoutes, {prefix: "/me"});
await app.register(aiRoutes, {prefix: "/ai"});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/swagger.json",
  schema: {
    hide: true,
  },
  handler: async () => {
    return app.swagger();
  },
});

//Rota de teste
app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    description: "Hello world",
    tags: ["Hello World"],
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  },
  handler: () => {
    return {
      message: "Hello World",
    };
  },
});

app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      // Construct request URL
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Convert Fastify headers to standard Headers object
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });
      // Create Fetch API-compatible request
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      // Process authentication request
      const response = await auth.handler(req);
      // Forward response to client
      reply.status(response.status);

      // Handle Set-Cookie specifically to support multiple cookies
      const setCookie = response.headers.getSetCookie?.();
      if (setCookie) {
        reply.header("set-cookie", setCookie);
      }

      response.headers.forEach((value, key) => {
        // Skip headers that should be handled by Fastify or that cause issues
        const skipHeaders = [
          "set-cookie",
          "content-length",
          "content-encoding",
          "transfer-encoding",
        ];
        if (!skipHeaders.includes(key.toLowerCase())) {
          reply.header(key, value);
        }
      });

      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      app.log.error(error);
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

try {
  await app.listen({ port: Number(process.env.PORT || 8081) });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
