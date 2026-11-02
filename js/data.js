// Site content and image registry. Image files live in assets/img/{full,thumb}/<key>.webp
export const FB_URL = 'https://www.facebook.com/rotaryclubdowntownbatangas/';

/** Full size dimensions per image key, from assets/img/manifest.json */
export const DIMS = {
  "hero-01":[960,959],
  "hero-02":[1500,1500],
  "hero-03":[960,960],
  "hero-04":[1920,1920],
  "run-01":[1107,721],
  "run-02":[1440,1920],
  "run-03":[1440,1920],
  "run-04":[1440,1920],
  "run-05":[1349,1920],
  "induction-01":[1920,1280],
  "induction-02":[1920,1280],
  "induction-03":[1920,1280],
  "induction-04":[1920,1280],
  "induction-05":[1920,1280],
  "induction-06":[1920,1280],
  "induction-07":[1920,1278],
  "induction-08":[1920,1278],
  "induction-09":[1920,1278],
  "induction-10":[1920,1278],
  "induction-11":[1920,1278],
  "induction-12":[1920,1280],
  "induction-13":[1920,1280],
  "induction-14":[1920,1280],
  "induction-15":[1920,1280],
  "induction-16":[1280,1920],
  "induction-17":[1280,1920],
  "induction-18":[1280,1920],
  "induction-19":[1920,1280],
  "induction-20":[1920,1280],
  "induction-21":[1920,1280],
  "induction-22":[1920,1280],
  "induction-23":[1920,1280],
  "induction-24":[1920,1280],
  "induction-25":[1920,1278],
  "induction-26":[1920,1278],
  "induction-27":[1920,1278],
  "induction-28":[1920,1280],
  "livelihood-01":[1920,1080],
  "livelihood-02":[1920,1280],
  "livelihood-03":[1920,1280],
  "livelihood-04":[1920,1280],
  "livelihood-05":[1920,1280],
  "livelihood-06":[1920,1280],
  "livelihood-07":[1920,1280],
  "livelihood-08":[1920,1280],
  "livelihood-09":[1920,1280],
  "livelihood-10":[1920,1280],
  "livelihood-11":[1920,1280],
  "livelihood-12":[1920,1280],
  "livelihood-13":[1920,1280],
  "livelihood-14":[1920,1280],
  "livelihood-15":[1920,1280],
  "livelihood-16":[1920,1280],
  "governor-01":[1920,1080],
  "governor-02":[1357,1920],
  "governor-03":[1920,1280],
  "governor-04":[1920,1280],
  "governor-05":[1920,1280],
  "governor-06":[1920,1280],
  "governor-07":[1920,1280],
  "governor-08":[1920,1280],
  "feeding-01":[811,540],
  "medical-01":[600,503],
  "plant-01":[1920,1920],
  "plant-02":[1920,1920],
  "plant-03":[1920,1920],
  "plant-04":[1920,1920],
  "plant-05":[1920,1920],
  "plant-06":[1920,1920],
  "plant-07":[1920,1920],
  "plant-08":[1920,1920],
  "plant-09":[1920,1920],
  "plant-10":[1920,1920],
  "plant-11":[1920,1920],
  "plant-12":[1920,1920],
  "milkbank-01":[1284,1710],
  "milkbank-02":[1284,1710],
  "milkbank-03":[1440,1080],
  "milkbank-04":[1440,1080],
  "milkbank-05":[1857,1080],
  "milkbank-06":[1902,1080],
  "milkbank-07":[1440,1080],
  "milkbank-08":[1887,1083],
  "sublian-01":[1920,1440],
  "sublian-02":[1920,1440],
  "sublian-03":[1920,1440],
  "sublian-04":[1920,1440],
  "meeting-01":[1920,1440],
  "meeting-02":[1920,1440],
  "meeting-03":[1920,1440],
  "meeting-04":[1440,1920],
  "meeting-05":[1440,1920],
  "brand-01":[1459,540],
  "brand-02":[1920,1920],
  "logo-01":[400,400],
  "logo-02":[667,667]
};

const THUMB_MAX = 640;

export const fullSrc = (key) => `assets/img/full/${key}.webp`;
export const thumbSrc = (key) => `assets/img/thumb/${key}.webp`;

/** Phone sized viewport, the same test as the background preload script in index.html. */
const SMALL_SCREEN = typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches;

/** Background photo URL: the lighter mobile derivative on small screens, the full image elsewhere. */
export const bgSrc = (key) => (SMALL_SCREEN ? `assets/img/md/${key}.webp` : fullSrc(key));

/** Thumb dimensions derived from the full size (thumbs are capped at 640px). */
export function thumbDims(key) {
  const [w, h] = DIMS[key] || [640, 427];
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  return [Math.round(w * scale), Math.round(h * scale)];
}

export function fullDims(key) {
  return DIMS[key] || [1920, 1280];
}

/** Every key of a group, in order (for example 'plant' gives plant-01 to plant-12). */
export function groupKeys(group) {
  return Object.keys(DIMS).filter((k) => k.startsWith(group + '-'));
}

export const SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'projects', label: 'Projects' },
  { id: 'events', label: 'Events' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'join', label: 'Join' },
];

/** Curated clean photos for each panel background. Direction alternates per panel. */
export const BACKGROUNDS = {
  // Unique photos per panel, no baked in posters, lockups or banners, landscape only.
  home: ['induction-02', 'induction-15', 'livelihood-05'],
  about: ['governor-03', 'livelihood-15', 'governor-08'],
  projects: ['livelihood-04', 'livelihood-06', 'livelihood-09'],
  events: ['induction-24', 'induction-05', 'governor-04'],
  gallery: ['livelihood-07', 'governor-07', 'livelihood-02'],
  join: ['livelihood-12', 'livelihood-08', 'livelihood-16'],
};

export const GROUP_LABELS = {
  induction: 'Joint Induction and Handover',
  governor: "Joint Governor's Visit",
  livelihood: 'Livelihood Projects',
  run: 'Run for Polio',
  feeding: 'Feeding Program',
  medical: 'Medical Mission',
  plant: 'Plant the Future',
  milkbank: "Mother's Milk Bank",
  sublian: 'Sublian Festival 2026',
  meeting: 'Club Meetings',
};

export const PROJECTS = [
  {
    id: 'plant',
    title: 'Plant the Future',
    date: 'August 29, 2026',
    time: '6:00 AM onwards',
    place: 'San Pedro, Batangas City',
    line: 'The future is in our hands. A tree planting drive led by Rtn. Ivee Magpantay and Rtn. Mydela Mendoza.',
    cover: 'plant-01',
    tag: 'Environment',
    images: groupKeys('plant').filter((k) => k !== 'plant-12'),
  },
  {
    id: 'livelihood',
    title: 'Livelihood and Community Garden',
    date: 'Community garden',
    time: 'Squash and pumpkin harvest',
    place: 'Batangas City',
    line: 'A community garden growing squash and pumpkin, harvested hand in hand with local families.',
    cover: 'livelihood-04',
    tag: 'Economic development',
    images: groupKeys('livelihood'),
  },
  {
    id: 'milkbank',
    title: "Mother's Milk Bank",
    date: "Hakab 'Ta 2026",
    time: 'Milk letting activity',
    place: 'SM City Batangas',
    line: "Launching the SM City Batangas depot with Sabayang Pagpapasuso, part of Hakab 'Ta 2026 with the Philippine Pediatric Society Southern Tagalog Chapter.",
    cover: 'milkbank-07',
    tag: 'Maternal and child health',
    images: groupKeys('milkbank'),
  },
  {
    id: 'medical',
    title: 'Medical, Dental and Eye Mission',
    date: 'September 18, 2026',
    time: '7:00 AM onwards',
    place: 'Brgy. Laurel, Taysan, Batangas',
    line: 'Medical, dental and eye check ups with RC Downtown Taysan, in partnership with RC Pila West, RC Meycauayan East and Brgy. Laurel, Taysan.',
    cover: 'medical-01',
    tag: 'Disease prevention',
    images: ['medical-01'],
  },
  {
    id: 'feeding',
    title: 'Alagang Rotaryo Feeding Program',
    date: 'September 15, 2026',
    time: '8:00 AM',
    place: 'Brgy. Kumintang Ibaba, Batangas City',
    line: 'Warm, nourishing meals shared with the children and families of Kumintang Ibaba.',
    cover: 'feeding-01',
    tag: 'Maternal and child health',
    images: ['feeding-01'],
  },
];

export const EVENTS = [
  {
    id: 'meeting',
    title: 'Regular Club Meetings',
    date: 'July 8, 2026',
    day: '08',
    month: 'JUL',
    place: "Stefanie's",
    line: 'Fellowship, planning and a turnover of donated medical supplies.',
    cover: 'meeting-01',
    images: groupKeys('meeting'),
  },
  {
    id: 'sublian',
    title: 'Sublian Festival 2026',
    date: 'July 23, 2026',
    day: '23',
    month: 'JUL',
    place: 'Batangas City 57th Foundation Day',
    line: 'Marching with the city in the grand parade for its 57th Foundation Day.',
    cover: 'sublian-01',
    images: groupKeys('sublian'),
  },
  {
    id: 'induction',
    title: 'Joint Induction and Handover Ceremonies',
    date: 'October 4, 2026',
    day: '04',
    month: 'OCT',
    place: 'Batangas City Convention Center',
    line: 'With RC Downtown Taysan. Inaugural address by President Antonio G. Perez.',
    cover: 'induction-15',
    images: groupKeys('induction'),
  },
  {
    id: 'governor',
    title: "Joint Governor's Visit",
    date: 'October 4, 2026',
    day: '04',
    month: 'OCT',
    place: "Ginazel's Hotel and Restaurant, Gulod Labac",
    line: 'Welcoming District Governor Eric B. Santos to Batangas City.',
    cover: 'governor-03',
    images: groupKeys('governor'),
  },
  {
    id: 'run',
    title: 'Run for Polio',
    date: 'World Polio Day, October 24',
    day: '24',
    month: 'OCT',
    place: 'End Polio Now',
    line: 'Rotarians and friends running so that no child suffers from polio again.',
    cover: 'run-01',
    images: groupKeys('run'),
  },
];

export const GALLERY_ORDER = [
  'induction', 'governor', 'livelihood', 'plant', 'milkbank',
  'run', 'sublian', 'meeting', 'feeding', 'medical',
];

export const FOCUS_AREAS = [
  'Peace', 'Disease prevention', 'Water and sanitation',
  'Maternal and child health', 'Education', 'Economic development', 'Environment',
];
