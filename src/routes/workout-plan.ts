import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ErrorSchema,
  WorkoutPlanResponseSchema,
  StartWorkoutSessionParamsSchema,
  StartWorkoutSessionResponseSchema,
} from "../schemas/index.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { StartWorkoutSession } from "../usecases/StartWorkoutSession.js";
import { NotFoundError } from "../errors/index.js";
import { WorkoutPlanNotActiveError } from "../errors/WorkoutPlanNotActiveError.js";
import { ConflictError } from "../errors/ConflictError.js";
import { IncomingHttpHeaders } from "http";

export const workoutPlanRoutes = async (app: FastifyInstance) => {
    app.withTypeProvider<ZodTypeProvider>().route({
  method: "POST",
  url: "/",
  schema: {
    tags: ["Workout Plan"],
    summary: "Create a workout plan", 
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

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/:workoutPlanId/days/:workoutDayId/sessions",
    schema: {
      tags: ["Workout Plan"],
      summary: "Start a workout session",
      params: StartWorkoutSessionParamsSchema,
      response: {
        201: StartWorkoutSessionResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        409: ErrorSchema,
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
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const startWorkoutSession = new StartWorkoutSession();
        const result = await startWorkoutSession.execute({
          userId: session.user.id,
          workoutPlanId: request.params.workoutPlanId,
          workoutDayId: request.params.workoutDayId,
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
        if (error instanceof WorkoutPlanNotActiveError) {
          return reply.status(400).send({
            error: error.message,
            code: "WORKOUT_PLAN_NOT_ACTIVE",
          });
        }
        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: "CONFLICT_ERROR",
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