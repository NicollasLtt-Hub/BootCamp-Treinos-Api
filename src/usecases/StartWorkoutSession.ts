import { ConflictError } from "../errors/ConflictError.js";
import { NotFoundError } from "../errors/index.js";
import { WorkoutPlanNotActiveError } from "../errors/WorkoutPlanNotActiveError.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

interface OutputDto {
  workoutSessionId: string;
}

export class StartWorkoutSession {
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

    if (!workoutPlan.isActive) {
      throw new WorkoutPlanNotActiveError();
    }

    const workoutDay = workoutPlan.workoutDays.find(
      (day) => day.id === dto.workoutDayId
    );

    if (!workoutDay) {
      throw new NotFoundError("Workout day not found");
    }

    const existingSession = await prisma.workoutSession.findFirst({
      where: {
        workoutDayId: dto.workoutDayId,
        completedAt: null,
      },
    });

    if (existingSession) {
      throw new ConflictError(
        "A workout session is already in progress for this day"
      );
    }

    const workoutSession = await prisma.workoutSession.create({
      data: {
        id: crypto.randomUUID(),
        workoutDayId: dto.workoutDayId,
        startedAt: new Date(),
      },
    });

    return {
      workoutSessionId: workoutSession.id,
    };
  }
}
