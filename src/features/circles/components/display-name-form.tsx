import { circles } from '../circles';

import { NameForm } from './name-form';

/** "How should people in your Circles see you?" Saves the shareable Circle display name (not the private account profile). */
export function DisplayNameForm({ initial, onSaved }: { initial?: string; onSaved?: () => void }) {
  return (
    <NameForm
      title="How should people in your Circles see you?"
      footer="Only members of your Circles see this name. It doesn’t need to be unique, and it’s separate from your account. Nothing else is shared: not your email, Faith settings, alarms or progress."
      label="Display name"
      placeholder="Display name"
      initial={initial}
      submitTitle="Save"
      busyTitle="Saving…"
      onSubmit={async (name) => {
        const outcome = await circles.setDisplayName(name);
        if (outcome.ok) onSaved?.();
        return outcome;
      }}
    />
  );
}
