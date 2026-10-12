import type { QuizPack } from '../types';

import { questionsFor } from './define';

const q = questionsFor('general');

/** General Knowledge, core pack v1. */
export const GENERAL_KNOWLEDGE_PACK: QuizPack = {
  id: 'core-general',
  version: 1,
  title: 'General Knowledge',
  questions: [
    // Easy: everyday facts.
    q('gk-e-001', 'easy', 'How many days are there in a leap year?', '366', ['365', '364', '360']),
    q('gk-e-002', 'easy', 'Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Mercury']),
    q('gk-e-003', 'easy', 'How many legs does a spider have?', '8', ['6', '10', '12']),
    q('gk-e-004', 'easy', 'What do bees make?', 'Honey', ['Silk', 'Milk', 'Cotton']),
    q('gk-e-005', 'easy', 'What is frozen water called?', 'Ice', ['Steam', 'Fog', 'Dew']),
    q('gk-e-006', 'easy', 'How many hours are there in a day?', '24', ['12', '36', '48']),
    q('gk-e-007', 'easy', 'Which colour do you get by mixing blue and yellow?', 'Green', ['Purple', 'Orange', 'Brown']),
    q('gk-e-008', 'easy', 'How many continents are there?', '7', ['5', '6', '8'], 'By the most widely used count.'),
    q('gk-e-009', 'easy', 'What is the largest ocean on Earth?', 'Pacific Ocean', ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean']),
    q('gk-e-010', 'easy', 'How many sides does a triangle have?', '3', ['4', '5', '6']),
    q('gk-e-011', 'easy', 'Which organ pumps blood around the body?', 'Heart', ['Lungs', 'Liver', 'Brain']),
    q('gk-e-012', 'easy', 'How many minutes are there in an hour?', '60', ['30', '100', '90']),
    q('gk-e-013', 'easy', 'Which animal is known for its very long neck?', 'Giraffe', ['Elephant', 'Zebra', 'Hippopotamus']),

    // Medium: school-level knowledge.
    q('gk-m-001', 'medium', 'Which gas do plants take in from the air to make their food?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Hydrogen'], 'Plants use carbon dioxide, water and sunlight in photosynthesis.'),
    q('gk-m-002', 'medium', 'What is the chemical symbol for gold?', 'Au', ['Ag', 'Gd', 'Go'], 'From the Latin word "aurum".'),
    q('gk-m-003', 'medium', 'How many bones are there in the adult human body?', '206', ['186', '226', '306']),
    q('gk-m-004', 'medium', 'Who painted the Mona Lisa?', 'Leonardo da Vinci', ['Michelangelo', 'Pablo Picasso', 'Vincent van Gogh']),
    q('gk-m-005', 'medium', 'At sea level, at what temperature does water boil?', '100 °C', ['90 °C', '80 °C', '120 °C']),
    q('gk-m-006', 'medium', 'Which planet is famous for its large, bright rings?', 'Saturn', ['Mars', 'Venus', 'Mercury']),
    q('gk-m-007', 'medium', 'What is the largest organ of the human body?', 'Skin', ['Liver', 'Brain', 'Heart']),
    q('gk-m-008', 'medium', 'How many players does a football (soccer) team have on the field?', '11', ['9', '10', '12']),
    q('gk-m-009', 'medium', 'What is the hardest natural substance?', 'Diamond', ['Gold', 'Iron', 'Quartz']),
    q('gk-m-010', 'medium', 'In which year did humans first land on the Moon?', '1969', ['1965', '1972', '1959'], 'Apollo 11 landed on 20 July 1969.'),
    q('gk-m-011', 'medium', 'What is the main language spoken in Brazil?', 'Portuguese', ['Spanish', 'English', 'French']),
    q('gk-m-012', 'medium', 'How many strings does a standard guitar have?', '6', ['4', '5', '7']),
    q('gk-m-013', 'medium', 'What do we call an animal that eats only plants?', 'Herbivore', ['Carnivore', 'Omnivore', 'Insectivore']),

    // Hard: science and less common facts.
    q('gk-h-001', 'hard', 'What is the chemical symbol for sodium?', 'Na', ['So', 'Sd', 'S'], 'From the Latin word "natrium".'),
    q('gk-h-002', 'hard', 'Which scientist described the three laws of motion?', 'Isaac Newton', ['Albert Einstein', 'Galileo Galilei', 'Nikola Tesla']),
    q('gk-h-003', 'hard', 'About how fast does light travel in a vacuum?', '300,000 km per second', ['30,000 km per second', '3,000 km per second', '3,000,000 km per second']),
    q('gk-h-004', 'hard', 'Which element has the atomic number 1?', 'Hydrogen', ['Helium', 'Oxygen', 'Carbon']),
    q('gk-h-005', 'hard', 'Which blood type is known as the universal red-cell donor?', 'O negative', ['AB positive', 'A positive', 'B negative']),
    q('gk-h-006', 'hard', 'Which part of a cell is known as its "powerhouse"?', 'Mitochondrion', ['Nucleus', 'Ribosome', 'Golgi apparatus'], 'Mitochondria release energy from food.'),
    q('gk-h-007', 'hard', 'How many chromosomes does a human body cell normally have?', '46', ['23', '44', '48'], '23 pairs.'),
    q('gk-h-008', 'hard', 'What is the SI unit of electrical resistance?', 'Ohm', ['Volt', 'Ampere', 'Watt']),
    q('gk-h-009', 'hard', 'Which vitamin does the skin make when exposed to sunlight?', 'Vitamin D', ['Vitamin C', 'Vitamin A', 'Vitamin B12']),
    q('gk-h-010', 'hard', 'At what temperature does water freeze on the Fahrenheit scale?', '32 °F', ['0 °F', '100 °F', '212 °F']),
    q('gk-h-011', 'hard', 'Which gas makes up most of Earth’s atmosphere?', 'Nitrogen', ['Oxygen', 'Carbon dioxide', 'Argon'], 'About 78% of the air is nitrogen.'),
    q('gk-h-012', 'hard', 'Which planet takes the shortest time to orbit the Sun?', 'Mercury', ['Venus', 'Mars', 'Earth'], 'Mercury’s year lasts about 88 Earth days.'),
    q('gk-h-013', 'hard', 'What is the longest bone in the human body?', 'Femur', ['Tibia', 'Humerus', 'Spine'], 'The femur is the thigh bone.'),
  ],
};
