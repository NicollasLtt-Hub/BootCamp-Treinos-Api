import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

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
  from: string;
  to: string;
}

interface ConsistencyDay {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
}

interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<string, ConsistencyDay>;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const fromDate = dayjs.utc(dto.from).startOf("day");
    const toDate = dayjs.utc(dto.to).endOf("day");

    // Buscar o WorkoutPlan ativo do usuário
    const activePlan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        isActive: true,
      },
      include: {
        workoutDays: {
          include: {
            workoutSessions: true, // Necessário para a streak (que olha pro histórico inteiro das sessões do plano)
          },
        },
      },
    });

    if (!activePlan) {
      // Se não tem plano ativo, podemos retornar tudo zerado, ou um erro.
      // Retornar um NotFoundError faz sentido baseado no comportamento do Home.
      throw new NotFoundError("Active workout plan not found");
    }

    // Buscar as sessões do usuário dentro do período pedido "from" até "to"
    const sessionsInRange = await prisma.workoutSession.findMany({
      where: {
        startedAt: {
          gte: fromDate.toDate(),
          lte: toDate.toDate(),
        },
        workoutDay: {
          workoutPlan: {
            userId: dto.userId,
          },
        },
      },
    });

    const totalSessions = sessionsInRange.length;
    let completedWorkoutsCount = 0;
    let totalTimeInSeconds = 0;

    const sessionsByDate = new Map<string, ConsistencyDay>();

    for (const session of sessionsInRange) {
      const dateKey = dayjs.utc(session.startedAt).format("YYYY-MM-DD");
      const existing = sessionsByDate.get(dateKey) || {
        workoutDayStarted: false,
        workoutDayCompleted: false,
      };

      existing.workoutDayStarted = true;

      if (session.completedAt) {
        existing.workoutDayCompleted = true; // Se tem múltiplos no mesmo dia, pelo menos um completou marca como completado
        completedWorkoutsCount++;
        totalTimeInSeconds += dayjs
          .utc(session.completedAt)
          .diff(dayjs.utc(session.startedAt), "seconds");
      }

      sessionsByDate.set(dateKey, existing);
    }

    const consistencyByDay = Object.fromEntries(sessionsByDate);
    const conclusionRate =
      totalSessions === 0 ? 0 : completedWorkoutsCount / totalSessions;

    // Calcular streak com base em hoje
    const currentDate = dayjs.utc();
    const workoutStreak = this.calculateStreak(
      activePlan.workoutDays,
      currentDate
    );

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
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
        streak++
        day = day.subtract(1, "day");
        continue;
      }

      const dateKey = day.format("YYYY-MM-DD");
      if (completedDates.has(dateKey)) {
        streak++;
        day = day.subtract(1, "day");
        continue;
      }

      // Regra de perdão especial para hoje
      if (i === 0 && isToday) {
        day = day.subtract(1, "day");
        continue;
      }

      break;
    }

    return streak;
  }
}
