import type { QuizPack } from '../types';

import { questionsFor } from './define';

const q = questionsFor('vocabulary');

/** Vocabulary (English), core pack v1. */
export const VOCABULARY_PACK: QuizPack = {
  id: 'core-vocabulary',
  version: 1,
  title: 'Vocabulary',
  questions: [
    // Easy: common opposites and synonyms.
    q('voc-e-001', 'easy', 'Which word means the same as "happy"?', 'Joyful', ['Angry', 'Tired', 'Hungry']),
    q('voc-e-002', 'easy', 'What is the opposite of "cold"?', 'Hot', ['Wet', 'Soft', 'Dark']),
    q('voc-e-003', 'easy', 'Which word means "very big"?', 'Enormous', ['Tiny', 'Narrow', 'Quiet']),
    q('voc-e-004', 'easy', 'What is the opposite of "early"?', 'Late', ['Fast', 'Soon', 'First']),
    q('voc-e-005', 'easy', 'Which word means the same as "begin"?', 'Start', ['End', 'Stop', 'Wait']),
    q('voc-e-006', 'easy', 'Which word means "not difficult"?', 'Easy', ['Heavy', 'Rare', 'Sharp']),
    q('voc-e-007', 'easy', 'What is the plural of "child"?', 'Children', ['Childs', 'Childes', 'Childrens']),
    q('voc-e-008', 'easy', 'What is the opposite of "ancient"?', 'Modern', ['Old', 'Broken', 'Famous']),
    q('voc-e-009', 'easy', 'Which word means "to look at something quickly"?', 'Glance', ['Stare', 'Sleep', 'Shout']),
    q('voc-e-010', 'easy', 'Which word means the same as "quick"?', 'Fast', ['Slow', 'Late', 'Heavy']),
    q('voc-e-011', 'easy', 'What does "brave" mean?', 'Showing courage', ['Feeling sleepy', 'Being rude', 'Feeling cold']),
    q('voc-e-012', 'easy', 'What is the opposite of "generous"?', 'Selfish', ['Kind', 'Rich', 'Polite']),
    q('voc-e-013', 'easy', 'Which of these words is a noun?', 'Table', ['Run', 'Quickly', 'Blue'], 'A noun names a person, place or thing.'),

    // Medium: less common everyday words.
    q('voc-m-001', 'medium', 'What does "diligent" mean?', 'Hard-working and careful', ['Lazy', 'Easily angered', 'Very loud']),
    q('voc-m-002', 'medium', 'Which word means the same as "abundant"?', 'Plentiful', ['Scarce', 'Fragile', 'Hidden']),
    q('voc-m-003', 'medium', 'What is the opposite of "transparent"?', 'Opaque', ['Clear', 'Bright', 'Thin'], 'Opaque means light cannot pass through.'),
    q('voc-m-004', 'medium', 'What does "reluctant" mean?', 'Unwilling', ['Eager', 'Confused', 'Lucky']),
    q('voc-m-005', 'medium', 'Which phrase means the same as "vivid"?', 'Bright and clear', ['Dull and grey', 'Silent', 'Ordinary']),
    q('voc-m-006', 'medium', 'What does "punctual" mean?', 'On time', ['Polite', 'Careful with money', 'Talkative']),
    q('voc-m-007', 'medium', 'What is the opposite of "expand"?', 'Contract', ['Grow', 'Extend', 'Increase']),
    q('voc-m-008', 'medium', 'What does "fragile" mean?', 'Easily broken', ['Very strong', 'Very heavy', 'Sweet-smelling']),
    q('voc-m-009', 'medium', 'Which word means the same as "conceal"?', 'Hide', ['Reveal', 'Build', 'Carry']),
    q('voc-m-010', 'medium', 'What does "optimistic" mean?', 'Hopeful about the future', ['Afraid of change', 'Very tired', 'Unfriendly']),
    q('voc-m-011', 'medium', 'What is the opposite of "humble"?', 'Arrogant', ['Modest', 'Gentle', 'Quiet']),
    q('voc-m-012', 'medium', 'What does "persevere" mean?', 'Keep trying despite difficulty', ['Give up quickly', 'Forget easily', 'Speak loudly']),
    q('voc-m-013', 'medium', 'What does "ponder" mean?', 'Think deeply', ['Run quickly', 'Laugh loudly', 'Eat slowly']),

    // Hard: advanced vocabulary.
    q('voc-h-001', 'hard', 'What does "ephemeral" mean?', 'Lasting a very short time', ['Lasting forever', 'Extremely large', 'Very old']),
    q('voc-h-002', 'hard', 'What does "ubiquitous" mean?', 'Found everywhere', ['Very rare', 'Unknown', 'Dangerous']),
    q('voc-h-003', 'hard', 'What does "benevolent" mean?', 'Kind and generous', ['Cruel', 'Nervous', 'Boastful']),
    q('voc-h-004', 'hard', 'Which phrase means the same as "candid"?', 'Frank and honest', ['Secretive', 'Sweet-tasting', 'Bad-tempered']),
    q('voc-h-005', 'hard', 'What does "meticulous" mean?', 'Very careful about detail', ['Careless', 'Quick-tempered', 'Shy']),
    q('voc-h-006', 'hard', 'What does "lethargic" mean?', 'Sluggish and lacking energy', ['Full of energy', 'Very cheerful', 'Easily scared']),
    q('voc-h-007', 'hard', 'What is the opposite of "verbose"?', 'Concise', ['Wordy', 'Loud', 'Boring'], 'Verbose means using more words than needed.'),
    q('voc-h-008', 'hard', 'What does "ambiguous" mean?', 'Having more than one possible meaning', ['Very clear', 'Extremely large', 'Long-lasting']),
    q('voc-h-009', 'hard', 'What does "pragmatic" mean?', 'Dealing with things sensibly and practically', ['Dreamy and unrealistic', 'Overly emotional', 'Easily bored']),
    q('voc-h-010', 'hard', 'What does "resilient" mean?', 'Able to recover quickly from difficulties', ['Easily broken', 'Always angry', 'Very slow']),
    q('voc-h-011', 'hard', 'What does "scrutinise" mean?', 'Examine closely', ['Ignore', 'Throw away', 'Celebrate']),
    q('voc-h-012', 'hard', 'What does "mitigate" mean?', 'Make less severe', ['Make worse', 'Hide completely', 'Repeat']),
    q('voc-h-013', 'hard', 'What does "gregarious" mean?', 'Fond of company; sociable', ['Shy', 'Greedy', 'Forgetful']),
  ],
};
