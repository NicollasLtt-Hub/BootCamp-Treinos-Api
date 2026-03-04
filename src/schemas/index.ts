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
            coverImageUrl: z.string().url().nullable().optional(),
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

export const StartWorkoutSessionParamsSchema = z.object({
    workoutPlanId: z.uuid(),
    workoutDayId: z.uuid(),
})

export const StartWorkoutSessionResponseSchema = z.object({
    workoutSessionId: z.uuid(),
})

export const CompleteWorkoutSessionParamsSchema = z.object({
    workoutPlanId: z.uuid(),
    workoutDayId: z.uuid(),
    sessionId: z.uuid(),
})

export const CompleteWorkoutSessionBodySchema = z.object({
    completedAt: z.iso.datetime(),
})

export const CompleteWorkoutSessionResponseSchema = z.object({
    id: z.uuid(),
    startedAt: z.string(),
    completedAt: z.string(),
})

export const GetHomeDataParamsSchema = z.object({
    date: z.string().date(),
})

export const GetHomeDataResponseSchema = z.object({
    activeWorkoutPlanId: z.string(),
    todayWorkoutDay: z.object({
        workoutPlanId: z.string(),
        id: z.string(),
        name: z.string(),
        isRest: z.boolean(),
        weekDay: z.nativeEnum(WeekDay),
        estimatedDurationInSeconds: z.number(),
        coverImageUrl: z.string().nullable().optional(),
        exercisesCount: z.number(),
    }).nullable(),
    workoutStreak: z.number(),
    consistencyByDay: z.record(
        z.string(),
        z.object({
            workoutDayCompleted: z.boolean(),
            workoutDayStarted: z.boolean(),
        }),
    ),
})
