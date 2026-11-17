/** Default-off preference for interface sound feedback. */

let soundFeedbackEnabled = false;

export function setSoundEnabled(enabled: boolean): void {
  soundFeedbackEnabled = enabled === true;
}

export function getSoundEnabled(): boolean {
  return soundFeedbackEnabled;
}

export function soundAllowed(enabled: boolean = soundFeedbackEnabled): boolean {
  return enabled === true;
}
