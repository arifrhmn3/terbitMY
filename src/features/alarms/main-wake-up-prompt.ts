import { formatAlarmTime, type AlarmDraft } from './alarm';
import { DAY_NAME, describeDays } from './main-wake-up';
import type { MainWakeUpChoice, MainWakeUpQuestion } from './morning';

export type PromptButton = { label: string; choice: MainWakeUpChoice | 'cancel'; style?: 'cancel' };
export type MainWakeUpPrompt = { title: string; message: string; buttons: PromptButton[] };

const MEANING = 'Your Main Wake-Up is the alarm Terbit MY uses for your morning streak and accountability.';
const times = (alarms: { hour: number; minute: number }[]) => [...new Set(alarms.map((a) => formatAlarmTime(a)))].join(' and ');

/** What replacing does to the other alarm(s): fewer days, or deleted. */
function replaceEffect(question: Extract<MainWakeUpQuestion, { kind: 'replace_days' }>): string {
  const kept = question.current.filter((a) => !question.deleting.includes(a));
  const parts: string[] = [];
  if (kept.length > 0) parts.push(`The ${times(kept)} alarm keeps its other days.`);
  if (question.deleting.length > 0) parts.push(`The ${times(question.deleting)} alarm will be deleted; its past mornings stay in Progress.`);
  return parts.join(' ');
}

/** The question shown before saving (null: nothing to ask). Plain words, short. */
export function mainWakeUpPrompt(question: MainWakeUpQuestion, draft: AlarmDraft): MainWakeUpPrompt | null {
  const time = formatAlarmTime(draft);
  const cancel: PromptButton = { label: 'Cancel', choice: 'cancel', style: 'cancel' };
  switch (question.kind) {
    case 'none':
      return null;
    case 'offer_main':
      return {
        title: 'Make this your Main Wake-Up?',
        message: MEANING,
        buttons: [
          { label: 'Not now', choice: 'not_now' },
          { label: 'Use as Main Wake-Up', choice: 'use_as_main' },
        ],
      };
    case 'replace_days': {
      const days = describeDays(question.days);
      const one = question.days.length === 1;
      const replace: PromptButton = { label: one ? `Replace ${days}’s Main Wake-Up` : 'Replace Main Wake-Up for these days', choice: 'replace' };
      return {
        title: `${days} already ${one ? 'has' : 'have'} a Main Wake-Up at ${times(question.current)}.`,
        message: question.explicit
          ? `${MEANING} Replacing it makes ${time} the Main Wake-Up for ${days}. ${replaceEffect(question)}`
          : `${MEANING} Replace it for ${days}, or keep it and make this a one-off morning alarm (it rings once, then turns itself off). If you replace it: ${replaceEffect(question)}`,
        buttons: question.explicit ? [replace, cancel] : [replace, { label: 'Keep existing Main Wake-Up', choice: 'keep_existing' }, cancel],
      };
    }
    case 'date_override': {
      const day = DAY_NAME[question.weekday];
      return {
        title: `Use ${time} as this ${day}’s Main Wake-Up?`,
        message: `Only this ${day} changes: your usual Main Wake-Up (${formatAlarmTime(question.current)}) stays for every other week. It still rings this ${day}, but doesn’t count as your morning.`,
        buttons: [
          { label: `Use for this ${day}`, choice: 'use_as_main' },
          question.explicit ? cancel : { label: 'Not now', choice: 'not_now' },
        ],
      };
    }
    case 'replace_date': {
      const day = DAY_NAME[question.weekday];
      return {
        title: `This ${day} already has a one-off Main Wake-Up at ${formatAlarmTime(question.current)}.`,
        message: `${MEANING} Replace it with ${time} for this ${day}? The ${formatAlarmTime(question.current)} one-off will be deleted (past mornings stay in Progress).`,
        buttons: [{ label: 'Replace it', choice: 'replace' }, question.explicit ? cancel : { label: 'Not now', choice: 'not_now' }],
      };
    }
  }
}
