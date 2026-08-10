import type { ForwardMove } from "./moves";
import type { SplitSevenMove } from "./specialMoves";

export type SplitSevenDestinationOption = {
  destination: ForwardMove["destination"];
  steps: ForwardMove[];
};

export function getSplitSevenDestinationOptions(
  moves: readonly SplitSevenMove[],
  assignedSteps: number,
  pieceId: string,
): SplitSevenDestinationOption[] {
  const options = new Map<string, SplitSevenDestinationOption>();

  for (const move of moves) {
    const steps: ForwardMove[] = [];

    for (const step of move.steps.slice(assignedSteps)) {
      if (step.pieceId !== pieceId) break;

      steps.push(step);
      const key = `${step.destination.zone}:${step.destination.index}`;

      if (!options.has(key)) {
        options.set(key, {
          destination: step.destination,
          steps: [...steps],
        });
      }
    }
  }

  return [...options.values()].sort((left, right) => left.steps.length - right.steps.length);
}
