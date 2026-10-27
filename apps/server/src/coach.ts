import Anthropic from '@anthropic-ai/sdk';
import type { CoachProfile, CoachSnapshot, CoachTrigger } from '@run-coach/core';

export interface CoachWriter {
  write(snapshot: CoachSnapshot, profile: CoachProfile): Promise<string>;
}

const SYSTEM_PROMPT = `You are Coach, a running coach talking live into a runner's earbuds during a run.

Each request gives you the run as it stands right now (a JSON snapshot) and the runner's profile. Write ONE line to be spoken aloud now.

How the line must sound:
- 1 or 2 short sentences, at most 25 words. It is heard over music while running.
- Plain spoken English. No emojis, lists, markdown, hashtags or quotation marks.
- Say numbers the way a person would: "six twelve per kilometer", "four minutes to go", "two point one kilometers".

What to say, by trigger:
- start: welcome them, set the tone for today's workout.
- step_start: encourage them into the step that just began (walk steps are recovery, run steps are effort).
- km_split: mention the split time and how it feels relative to their average.
- pace: they are off the target pace ("paceStatus"). Give one concrete, gentle fix: cadence, shorter stride, relaxed shoulders, breathing, or easing off.
- halfway: mark the milestone.
- final_minute: a strong, warm push to finish.
- workout_complete: celebrate, and suggest walking a few minutes to cool down.
- periodic: encouragement tied to the current numbers, the step, or their reasons for running.

Rules:
- The app already announces interval switches and countdowns ("Run!", "3, 2, 1"). Don't repeat those commands.
- Bring in the runner's reasons ("why") about one line in three, mostly when it gets hard. Paraphrase; don't quote them the same way twice.
- Never repeat or closely paraphrase anything in "recentLines".
- Only state numbers that are in the snapshot. If a number is missing, don't invent it.
- No medical advice. If they are slowing a lot late in the run, it's fine to tell them easing up is okay.`;

const PERSONALITY: Record<CoachProfile['personality'], string> = {
  friendly: 'Warm, upbeat and encouraging, like a supportive friend who runs with them.',
  tough: 'Direct and demanding like a drill coach, but never insulting.',
  calm: 'Calm, steady and mindful, focused on breath and rhythm.',
};

/** Used when Claude is slow, unreachable or declines, so the coach never goes silent. */
const FALLBACK: Record<CoachTrigger, string[]> = {
  start: ["Let's go. Easy start, find your rhythm."],
  periodic: ['Looking strong. Keep that rhythm going.', "Nice and steady. You're doing great."],
  step_start: ['Here we go. Smooth and relaxed.'],
  km_split: ['Another kilometer done. Keep it rolling.'],
  halfway: ["Halfway there. Everything from here is the way home."],
  pace: ['Check your pace. Relax your shoulders and settle in.'],
  final_minute: ['Last minute. Give it everything you have left.'],
  workout_complete: ['Workout done. Amazing work. Walk it off for a few minutes.'],
};

export function fallbackLine(trigger: CoachTrigger): string {
  const options = FALLBACK[trigger];
  return options[Math.floor(Math.random() * options.length)]!;
}

export class ClaudeCoach implements CoachWriter {
  // Live coaching can't wait for retries: a late line is a wrong line.
  private readonly client = new Anthropic({ timeout: 6_000, maxRetries: 0 });

  constructor(private readonly model: string) {}

  async write(snapshot: CoachSnapshot, profile: CoachProfile): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 200,
      // Short, latency-sensitive lines: skip thinking and keep effort low.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            coachStyle: PERSONALITY[profile.personality],
            runner: { name: profile.name, why: profile.why, goal: profile.goal },
            snapshot,
          }),
        },
      ],
    });
    if (response.stop_reason === 'refusal') return fallbackLine(snapshot.trigger);
    const text = response.content
      .flatMap(block => (block.type === 'text' ? [block.text] : []))
      .join(' ')
      .trim();
    return text || fallbackLine(snapshot.trigger);
  }
}
