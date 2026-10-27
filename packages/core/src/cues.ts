import type { EngineEvent } from './engine';
import { stepName } from './workout';

function spokenDuration(totalSec: number): string {
  const s = Math.round(totalSec);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (sec > 0 || m === 0) parts.push(`${sec} ${sec === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}

/**
 * The instant cue the phone speaks for an engine event, with no network.
 * Returns null for events that only the AI coach talks about.
 */
export function cueText(event: EngineEvent): string | null {
  switch (event.type) {
    case 'step_start': {
      const { step } = event;
      const name = stepName(step);
      const what =
        step.durationSec != null
          ? spokenDuration(step.durationSec)
          : step.distanceM != null
            ? `${step.distanceM} meters`
            : '';
      const round = step.round != null && step.rounds != null ? `Round ${step.round} of ${step.rounds}. ` : '';
      return `${round}${name}${step.kind === 'run' || step.kind === 'fast' ? '!' : '.'} ${what}.`.trim();
    }
    case 'countdown':
      return String(event.secondsLeft);
    case 'km_split':
      return `${event.km} ${event.km === 1 ? 'kilometer' : 'kilometers'}. Last split ${spokenDuration(event.splitSec)}.`;
    case 'workout_complete':
      return 'Workout complete. Great job.';
    case 'halfway':
    case 'pace':
      return null;
  }
}
