/**
 * The prompts that can open by themselves when the app is opened. Only one does per visit: the
 * rest keep their place and open on a later visit, instead of queueing up one after another.
 */
export type LaunchPrompt = 'onboarding' | 'release' | 'home-guide' | 'weekly-review';

/** Whether `candidate` may open by itself, given the prompt already opened this visit. */
export function launchPromptAllowed(opened: LaunchPrompt | null, candidate: LaunchPrompt): boolean {
  return opened === null || opened === candidate;
}
