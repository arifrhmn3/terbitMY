import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { MathMissionView } from '@/features/missions/math/math-mission-view';
import { MATH_DIFFICULTIES, MATH_QUESTION_COUNTS } from '@/features/missions/math/questions';

/** Practise a maths mission outside an alarm. Nothing rings here. */
export default function PracticeMissionScreen() {
  const params = useLocalSearchParams<{ difficulty?: string; count?: string }>();
  const difficulty = MATH_DIFFICULTIES.find((d) => d === params.difficulty) ?? 'easy';
  const questionCount = MATH_QUESTION_COUNTS.find((c) => String(c) === params.count) ?? 3;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Practice mission', headerLargeTitleEnabled: false }} />
      <Notice
        title="Practice mode"
        description="This is a practice run of the maths mission. It is not connected to any alarm."
      />
      <MathMissionView
        config={{ difficulty, questionCount }}
        onDone={() => router.back()}
      />
    </Screen>
  );
}
