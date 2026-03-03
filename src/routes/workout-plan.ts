import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorSchema, WorkoutPlanResponseSchema } from "../schemas/index.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { NotFoundError } from "../errors/index.js";
import { IncomingHttpHeaders } from "http";

export const workoutPlanRoutes = async (app: FastifyInstance) => {
    app.withTypeProvider<ZodTypeProvider>().route({
  method: "POST",
  url: "/",
  schema: {
    body: WorkoutPlanResponseSchema.omit({id:true, userId:true, isActive:true}),
    response: {
      201: WorkoutPlanResponseSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
  },
  handler: async (request, reply) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.status(401).send({
          error: "Unautorized",
          code: "UNAUTHORIZED",
        });
      }
      const createWorkoutPlan = new CreateWorkoutPlan();
      const result = await createWorkoutPlan.execute({
        userId: session.user.id,
        name: request.body.name,
        workoutDays: request.body.workoutDays,
      });
      return reply.status(201).send(result);
    } catch (error) {
      app.log.error(error);
      if (error instanceof NotFoundError) {
        return reply.status(404).send({
          error: error.message,
          code: "NOT_FOUND_ERROR",
        });
      }
      return reply.status(500).send({
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  },
});
}

// Helper function to convert Fastify headers to standard Headers
function fromNodeHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "undefined") continue;

    if (Array.isArray(value)) {
      for (const v of value) {
        result.append(key, v);
      }
      continue;
    }

    result.append(key, value);
  }

  return result;
}