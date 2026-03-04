import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { WeekDay } from "../generated/prisma/enums.js";

dayjs.extend(utc);

const WEEKDAY_MAP: Record<number, WeekDay> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

interface InputDto {
  userId: string;
  date: string;
}

interface ConsistencyDay {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
}

interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl: string | null;
    exercisesCount: number;
  } | null;

  workoutStreak: number;
  consistencyByDay: Record<string, ConsistencyDay>;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const currentDate = dayjs.utc(dto.date);
    const todayWeekDay = WEEKDAY_MAP[currentDate.day()];

    // Calcular range da semana (domingo a sábado)
    const weekStart = currentDate.day(0).startOf("day"); // Domingo 00:00:00
    const weekEnd = currentDate.day(6).endOf("day"); // Sábado 23:59:59

    // Buscar workout plan ativo
    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        isActive: true,
      },
      include: {
        workoutDays: {
          include: {
            _count: {
              select: { exercises: true },
            },
            workoutSessions: {
              where: {
                startedAt: {
                  gte: weekStart.toDate(),
                  lte: weekEnd.toDate(),
                },
              },
            },
          },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Active workout plan not found");
    }

    // Treino do dia
    const todayWorkoutDayData = workoutPlan.workoutDays.find(
      (day) => day.weekDay === todayWeekDay
    );

    const todayWorkoutDay = todayWorkoutDayData
      ? {
          workoutPlanId: workoutPlan.id,
          id: todayWorkoutDayData.id,
          name: todayWorkoutDayData.name,
          isRest: todayWorkoutDayData.isRest,
          weekDay: todayWorkoutDayData.weekDay,
          estimatedDurationInSeconds:
            todayWorkoutDayData.estimatedDurationInSeconds,
          coverImageUrl: todayWorkoutDayData.coverImageUrl,
          exercisesCount: todayWorkoutDayData._count.exercises,
        }
      : null;

    // Workout streak
    const workoutStreak = this.calculateStreak(
      workoutPlan.workoutDays,
      currentDate
    );

    // Consistency by day
    const consistencyByDay = this.buildConsistencyByDay(
      workoutPlan.workoutDays,
      weekStart
    );

    return {
      activeWorkoutPlanId: workoutPlan.id,
      todayWorkoutDay,
      workoutStreak,
      consistencyByDay,
    };
  }

  private calculateStreak(
    workoutDays: Array<{
      weekDay: string;
      isRest: boolean;
      workoutSessions: Array<{
        startedAt: Date;
        completedAt: Date | null;
      }>;
    }>,
    currentDate: dayjs.Dayjs
  ): number {
    let streak = 0;
    let day = currentDate;
    const isToday = dayjs.utc().format("YYYY-MM-DD") === currentDate.format("YYYY-MM-DD");

    const planWeekDays = new Set(workoutDays.map((d) => d.weekDay));
    const restWeekDays = new Set(
      workoutDays.filter((d) => d.isRest).map((d) => d.weekDay)
    );

    const completedDates = new Set<string>();
    workoutDays.forEach((dayInfo) => {
      dayInfo.workoutSessions.forEach((session) => {
        if (session.completedAt !== null) {
          completedDates.add(dayjs.utc(session.startedAt).format("YYYY-MM-DD"));
        }
      });
    });

    for (let i = 0; i < 365; i++) {
      const weekDay = WEEKDAY_MAP[day.day()];

      if (!planWeekDays.has(weekDay)) {
        day = day.subtract(1, "day");
        continue;
      }

      if (restWeekDays.has(weekDay)) {
        day = day.subtract(1, "day");
        continue;
      }

      const dateKey = day.format("YYYY-MM-DD");
      if (completedDates.has(dateKey)) {
        streak++;
        day = day.subtract(1, "day");
        continue;
      }

      if (i === 0 && isToday) {
        day = day.subtract(1, "day");
        continue;
      }

      break;
    }

    return streak;
  }

  private buildConsistencyByDay(
    workoutDays: Array<{
      workoutSessions: Array<{
        startedAt: Date;
        completedAt: Date | null;
      }>;
    }>,
    weekStart: dayjs.Dayjs
  ): Record<string, ConsistencyDay> {
    // Coletar todas as sessões da semana agrupadas por data
    const sessionsByDate = new Map<
      string,
      { started: boolean; completed: boolean }
    >();

    for (const workoutDay of workoutDays) {
      for (const session of workoutDay.workoutSessions) {
        const dateKey = dayjs.utc(session.startedAt).format("YYYY-MM-DD");
        const existing = sessionsByDate.get(dateKey) || {
          started: false,
          completed: false,
        };

        existing.started = true;
        if (session.completedAt !== null) {
          existing.completed = true;
        }

        sessionsByDate.set(dateKey, existing);
      }
    }

    // Montar os 7 dias da semana (domingo a sábado)
    const consistency: Record<string, ConsistencyDay> = {};
    for (let i = 0; i < 7; i++) {
      const dayDate = weekStart.add(i, "day").format("YYYY-MM-DD");
      const sessionData = sessionsByDate.get(dayDate);

      consistency[dayDate] = {
        workoutDayStarted: sessionData?.started ?? false,
        workoutDayCompleted: sessionData?.completed ?? false,
      };
    }

    return consistency;
  }
}
