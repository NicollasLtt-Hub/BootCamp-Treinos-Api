import z from "zod";
import { WeekDay } from "../generated/prisma/enums.js";

export const ErrorSchema = z.object({
    error: z.string(),
    code: z.string(),
})

export const WorkoutPlanResponseSchema = z.object({
    id: z.uuid(),
    name: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    isActive: z.boolean(),
    workoutDays: z.array(
        z.object({
            name: z.string().trim().min(1),
            weekDay: z.nativeEnum(WeekDay),
            isRest: z.boolean(),
            estimatedDurationInSeconds: z.number().min(1),
            exercises: z.array(
                z.object({
                    order: z.number().min(0),
                    name: z.string().trim().min(1),
                    sets: z.number().min(1),
                    reps: z.number().min(1),
                    restTimeInSeconds: z.number().min(1),
                }),
            ),
        }),
    ),
})
