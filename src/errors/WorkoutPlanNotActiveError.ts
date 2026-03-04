export class WorkoutPlanNotActiveError extends Error {
  constructor(message: string = "Workout plan is not active") {
    super(message);
    this.name = "WorkoutPlanNotActiveError";
  }
}
