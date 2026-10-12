import type { QuizPack } from '../types';

import { questionsFor } from './define';

const q = questionsFor('logic');

/** Logic and reasoning, core pack v1. Every answer can be worked out; no outside knowledge needed. */
export const LOGIC_PACK: QuizPack = {
  id: 'core-logic',
  version: 1,
  title: 'Logic',
  questions: [
    // Easy: one-step patterns and reasoning.
    q('log-e-001', 'easy', 'What comes next: 2, 4, 6, 8, …?', '10', ['9', '12', '11']),
    q('log-e-002', 'easy', 'What comes next: A, B, C, D, …?', 'E', ['F', 'G', 'Z']),
    q('log-e-003', 'easy', 'If today is Monday, what day is tomorrow?', 'Tuesday', ['Sunday', 'Wednesday', 'Friday']),
    q('log-e-004', 'easy', 'Which is the odd one out?', 'Carrot', ['Apple', 'Banana', 'Mango'], 'The others are fruits; a carrot is a vegetable.'),
    q('log-e-005', 'easy', 'What comes next: 5, 10, 15, 20, …?', '25', ['30', '21', '24']),
    q('log-e-006', 'easy', 'All cats are animals. Tom is a cat. So Tom is…', 'An animal', ['A dog', 'A plant', 'Not an animal']),
    q('log-e-007', 'easy', 'Which shape has four equal sides and four right angles?', 'Square', ['Triangle', 'Circle', 'Pentagon']),
    q('log-e-008', 'easy', 'What comes next: 1, 3, 5, 7, …?', '9', ['8', '10', '11']),
    q('log-e-009', 'easy', 'You face north and turn right. Which way do you face now?', 'East', ['West', 'South', 'North']),
    q('log-e-010', 'easy', 'Which is the odd one out?', 'Circle', ['Red', 'Blue', 'Green'], 'The others are colours; a circle is a shape.'),
    q('log-e-011', 'easy', 'What comes next: 10, 20, 30, …?', '40', ['35', '50', '31']),
    q('log-e-012', 'easy', 'Ali is taller than Ben. Ben is taller than Chong. Who is the shortest?', 'Chong', ['Ali', 'Ben', 'You can’t tell']),
    q('log-e-013', 'easy', 'What comes next: Z, Y, X, W, …?', 'V', ['U', 'A', 'T']),

    // Medium: two-step patterns and reasoning.
    q('log-m-001', 'medium', 'What comes next: 1, 4, 9, 16, …?', '25', ['20', '24', '36'], 'These are square numbers: 1², 2², 3², 4², 5².'),
    q('log-m-002', 'medium', 'What comes next: 2, 6, 12, 20, 30, …?', '42', ['40', '36', '44'], 'The gaps grow by 2 each time: 4, 6, 8, 10, 12.'),
    q('log-m-003', 'medium', 'How many months of the year have at least 28 days?', '12', ['1', '2', '6'], 'Every month has at least 28 days.'),
    q('log-m-004', 'medium', 'If 3 pens cost RM6, how much do 5 pens cost?', 'RM10', ['RM8', 'RM12', 'RM15'], 'Each pen costs RM2.'),
    q('log-m-005', 'medium', 'What comes next: 1, 1, 2, 3, 5, 8, …?', '13', ['11', '12', '15'], 'Each number is the sum of the two before it.'),
    q('log-m-006', 'medium', 'A clock shows exactly 3:00. What is the angle between the hands?', '90°', ['180°', '45°', '120°']),
    q('log-m-007', 'medium', 'You face east and turn around completely (180°). Which way do you face?', 'West', ['North', 'South', 'East']),
    q('log-m-008', 'medium', 'Which number is the odd one out: 3, 5, 7, 9, 11?', '9', ['3', '5', '11'], 'The others are prime numbers; 9 = 3 × 3.'),
    q('log-m-009', 'medium', 'What comes next: AZ, BY, CX, …?', 'DW', ['DV', 'EW', 'CW']),
    q('log-m-010', 'medium', 'If yesterday was Wednesday, what day will tomorrow be?', 'Friday', ['Thursday', 'Saturday', 'Tuesday']),
    q('log-m-011', 'medium', 'A farmer has 17 sheep. All but 9 run away. How many are left?', '9', ['8', '17', '0']),
    q('log-m-012', 'medium', 'What comes next: 3, 9, 27, …?', '81', ['54', '36', '30'], 'Each number is three times the one before.'),
    q('log-m-013', 'medium', 'In a code, CAT is written DBU. How is DOG written?', 'EPH', ['EOH', 'DPH', 'FPH'], 'Each letter moves one place forward in the alphabet.'),

    // Hard: multi-step reasoning and classic puzzles.
    q('log-h-001', 'hard', 'What comes next: 2, 3, 5, 7, 11, …?', '13', ['12', '15', '17'], 'These are the prime numbers.'),
    q('log-h-002', 'hard', 'What comes next: 1, 2, 6, 24, 120, …?', '720', ['600', '240', '840'], 'Multiply by 2, 3, 4, 5, then 6.'),
    q('log-h-003', 'hard', 'A bat and a ball cost RM1.10 together. The bat costs RM1.00 more than the ball. How much is the ball?', '5 sen', ['10 sen', '15 sen', '1 sen'], 'Ball 5 sen + bat RM1.05 = RM1.10.'),
    q('log-h-004', 'hard', '5 machines make 5 parts in 5 minutes. How long do 100 machines take to make 100 parts?', '5 minutes', ['100 minutes', '20 minutes', '1 minute'], 'Each machine makes one part in 5 minutes.'),
    q('log-h-005', 'hard', 'What comes next: 0, 1, 3, 6, 10, 15, …?', '21', ['20', '25', '18'], 'Add 1, 2, 3, 4, 5, then 6.'),
    q('log-h-006', 'hard', 'A patch of lily pads doubles in size every day and covers the whole lake on day 48. On which day did it cover half the lake?', 'Day 47', ['Day 24', 'Day 46', 'Day 12']),
    q('log-h-007', 'hard', 'What comes next: 7, 14, 28, 56, …?', '112', ['84', '70', '128']),
    q('log-h-008', 'hard', 'Two people paint a wall in 6 hours. Working at the same rate, how long would 3 people take?', '4 hours', ['9 hours', '3 hours', '2 hours'], 'The job takes 12 person-hours; 12 ÷ 3 = 4.'),
    q('log-h-009', 'hard', 'All Bloops are Razzies, and all Razzies are Lazzies. Which must be true?', 'All Bloops are Lazzies', ['All Lazzies are Bloops', 'Some Razzies are not Bloops', 'No Bloops are Lazzies']),
    q('log-h-010', 'hard', 'How many times do the hour and minute hands of a clock overlap in 12 hours?', '11', ['12', '24', '10']),
    q('log-h-011', 'hard', 'What comes next: 1, 8, 27, 64, …?', '125', ['100', '81', '216'], 'These are cube numbers: 1³, 2³, 3³, 4³, 5³.'),
    q('log-h-012', 'hard', 'A train leaves at 9:45 and the journey takes 2 hours 35 minutes. When does it arrive?', '12:20', ['12:10', '11:20', '12:30']),
    q('log-h-013', 'hard', 'Sara is 4 years older than her brother. In 6 years their ages will add up to 30. How old is Sara now?', '11', ['9', '13', '7'], 'Now they add up to 18, so her brother is 7 and Sara is 11.'),
  ],
};
