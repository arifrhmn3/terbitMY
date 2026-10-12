import type { QuizPack } from '../types';

import { questionsFor } from './define';

const q = questionsFor('geography');

/** Geography, core pack v1 (with a Malaysian focus). */
export const GEOGRAPHY_PACK: QuizPack = {
  id: 'core-geography',
  version: 1,
  title: 'Geography',
  questions: [
    // Easy: well-known capitals and places.
    q('geo-e-001', 'easy', 'What is the capital city of Malaysia?', 'Kuala Lumpur', ['Putrajaya', 'Johor Bahru', 'George Town'], 'Putrajaya is the federal administrative centre; Kuala Lumpur is the capital.'),
    q('geo-e-002', 'easy', 'Which country lies just south of Peninsular Malaysia, across the Johor Strait?', 'Singapore', ['Thailand', 'Indonesia', 'Brunei']),
    q('geo-e-003', 'easy', 'What is the capital of Japan?', 'Tokyo', ['Osaka', 'Kyoto', 'Seoul']),
    q('geo-e-004', 'easy', 'Which is the largest continent by area?', 'Asia', ['Africa', 'Europe', 'Antarctica']),
    q('geo-e-005', 'easy', 'Which country borders Peninsular Malaysia to the north?', 'Thailand', ['Myanmar', 'Cambodia', 'Vietnam']),
    q('geo-e-006', 'easy', 'What is the capital of the United Kingdom?', 'London', ['Paris', 'Manchester', 'Dublin']),
    q('geo-e-007', 'easy', 'On which island are the Malaysian states of Sabah and Sarawak?', 'Borneo', ['Sumatra', 'Java', 'Sulawesi']),
    q('geo-e-008', 'easy', 'What is the capital of France?', 'Paris', ['Rome', 'Madrid', 'Berlin']),
    q('geo-e-009', 'easy', 'Which river flows through Egypt?', 'Nile', ['Amazon', 'Danube', 'Mekong']),
    q('geo-e-010', 'easy', 'What is the capital of Thailand?', 'Bangkok', ['Chiang Mai', 'Phuket', 'Hanoi']),
    q('geo-e-011', 'easy', 'Which is the largest country in the world by area?', 'Russia', ['Canada', 'China', 'United States']),
    q('geo-e-012', 'easy', 'On which continent is Egypt?', 'Africa', ['Asia', 'Europe', 'South America']),
    q('geo-e-013', 'easy', 'What is the capital of Saudi Arabia?', 'Riyadh', ['Jeddah', 'Dammam', 'Abha']),

    // Medium: Malaysian states and less obvious capitals.
    q('geo-m-001', 'medium', 'What is the capital of Australia?', 'Canberra', ['Sydney', 'Melbourne', 'Perth']),
    q('geo-m-002', 'medium', 'What is the highest mountain in Malaysia?', 'Mount Kinabalu', ['Gunung Tahan', 'Gunung Ledang', 'Gunung Jerai'], 'Mount Kinabalu in Sabah is about 4,095 m high.'),
    q('geo-m-003', 'medium', 'Which is the longest river in Malaysia?', 'Rajang River', ['Pahang River', 'Kinabatangan River', 'Perak River'], 'The Rajang flows through Sarawak.'),
    q('geo-m-004', 'medium', 'What is the capital of Canada?', 'Ottawa', ['Toronto', 'Vancouver', 'Montreal']),
    q('geo-m-005', 'medium', 'What is the capital of Sabah?', 'Kota Kinabalu', ['Sandakan', 'Tawau', 'Kuching']),
    q('geo-m-006', 'medium', 'What is the capital of Sarawak?', 'Kuching', ['Miri', 'Sibu', 'Bintulu']),
    q('geo-m-007', 'medium', 'Which strait separates Peninsular Malaysia from Sumatra?', 'Strait of Malacca', ['Strait of Gibraltar', 'Bering Strait', 'Johor Strait']),
    q('geo-m-008', 'medium', 'What is the largest hot desert in the world?', 'Sahara', ['Gobi', 'Kalahari', 'Arabian Desert']),
    q('geo-m-009', 'medium', 'Which country is called the "Land of the Rising Sun"?', 'Japan', ['China', 'South Korea', 'Thailand']),
    q('geo-m-010', 'medium', 'What is the capital of Türkiye (Turkey)?', 'Ankara', ['Istanbul', 'Izmir', 'Bursa']),
    q('geo-m-011', 'medium', 'Which Malaysian state is known as the "Land Below the Wind"?', 'Sabah', ['Sarawak', 'Kedah', 'Pahang']),
    q('geo-m-012', 'medium', 'How many states does Malaysia have?', '13', ['11', '14', '16'], 'There are 13 states and 3 federal territories.'),
    q('geo-m-013', 'medium', 'What is the capital of New Zealand?', 'Wellington', ['Auckland', 'Christchurch', 'Queenstown']),

    // Hard: less familiar capitals and record holders.
    q('geo-h-001', 'hard', 'What is the capital of Myanmar?', 'Naypyidaw', ['Yangon', 'Mandalay', 'Bagan']),
    q('geo-h-002', 'hard', 'What is the deepest known point in the world’s oceans?', 'Challenger Deep', ['Puerto Rico Trench', 'Java Trench', 'Tonga Trench'], 'It lies in the Mariana Trench in the Pacific.'),
    q('geo-h-003', 'hard', 'Which Malaysian state has the largest land area?', 'Sarawak', ['Sabah', 'Pahang', 'Perak']),
    q('geo-h-004', 'hard', 'Which is the largest lake in the world by surface area?', 'Caspian Sea', ['Lake Superior', 'Lake Victoria', 'Lake Baikal']),
    q('geo-h-005', 'hard', 'What is the capital of Brunei?', 'Bandar Seri Begawan', ['Kuala Belait', 'Seria', 'Tutong']),
    q('geo-h-006', 'hard', 'Which is the longest river in Southeast Asia?', 'Mekong', ['Irrawaddy', 'Chao Phraya', 'Rajang']),
    q('geo-h-007', 'hard', 'Which city is the federal city (seat of government) of Switzerland?', 'Bern', ['Zurich', 'Geneva', 'Basel']),
    q('geo-h-008', 'hard', 'Malaysia lies a little north of which line of latitude?', 'The Equator', ['Tropic of Cancer', 'Tropic of Capricorn', 'Arctic Circle']),
    q('geo-h-009', 'hard', 'What is the highest mountain in Peninsular Malaysia?', 'Gunung Tahan', ['Mount Kinabalu', 'Gunung Jerai', 'Gunung Ledang'], 'Gunung Tahan, in Pahang, is about 2,187 m high.'),
    q('geo-h-010', 'hard', 'What is the smallest country in the world by area?', 'Vatican City', ['Monaco', 'San Marino', 'Liechtenstein']),
    q('geo-h-011', 'hard', 'Which African country has the largest population?', 'Nigeria', ['Egypt', 'Ethiopia', 'South Africa']),
    q('geo-h-012', 'hard', 'What is the capital of Vietnam?', 'Hanoi', ['Ho Chi Minh City', 'Da Nang', 'Hue']),
    q('geo-h-013', 'hard', 'Which is the smallest Malaysian state by area?', 'Perlis', ['Melaka', 'Penang', 'Negeri Sembilan']),
  ],
};
