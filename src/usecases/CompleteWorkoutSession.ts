import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
  sessionId: string;
  completedAt: string;
}

interface OutputDto {
  id: string;
  startedAt: string;
  completedAt: string;
}

export class CompleteWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutPlan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      include: {
        workoutDays: true,
      },
    });

    if (!workoutPlan || workoutPlan.userId !== dto.userId) {
      throw new NotFoundError("Workout plan not found");
    }

    const workoutDay = workoutPlan.workoutDays.find(
      (day) => day.id === dto.workoutDayId
    );

    if (!workoutDay) {
      throw new NotFoundError("Workout day not found");
    }

    const workoutSession = await prisma.workoutSession.findUnique({
      where: {
        id: dto.sessionId,
        workoutDayId: dto.workoutDayId,
      },
    });

    if (!workoutSession) {
      throw new NotFoundError("Workout session not found");
    }

    const updatedSession = await prisma.workoutSession.update({
      where: { id: dto.sessionId },
      data: {
        completedAt: new Date(dto.completedAt),
      },
    });

    return {
      id: updatedSession.id,
      startedAt: updatedSession.startedAt.toISOString(),
      completedAt: updatedSession.completedAt!.toISOString(),
    };
  }
}
