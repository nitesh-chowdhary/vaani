import type { ConceptMedia } from './types.js';

const VISUAL_TOPICS = [
  'action',
  'animal',
  'body',
  'clothing',
  'colour',
  'color',
  'communication',
  'emergency',
  'family',
  'food',
  'health',
  'home',
  'number',
  'object',
  'people',
  'place',
  'quantity',
  'shopping',
  'study',
  'transport',
  'travel',
  'work',
];
const licenseUrl = 'https://unsplash.com/license';
const curated: Record<
  string,
  Pick<ConceptMedia, 'url' | 'query' | 'attribution'>
> = {
  'te.lex.milk': {
    url: '/media/telugu/beginner/milk.jpg',
    query: 'single clear glass of milk on a table',
    attribution: {
      creator: 'Santeri Viinamäki',
      creatorUrl: 'https://commons.wikimedia.org/wiki/User:Zunter',
      sourceName: 'Wikimedia Commons',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Glass_of_milk.jpg',
      licenseName: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
  },
  'te.lex.food': {
    url: '/media/telugu/beginner/food.jpg',
    query: 'clear bowl of prepared food',
    attribution: {
      creator: 'Anna Pelzer',
      creatorUrl:
        'https://unsplash.com/@annapelzer?utm_source=vaani&utm_medium=referral',
      sourceName: 'Unsplash',
      sourceUrl:
        'https://unsplash.com/photos/IGfIGP5ONV0?utm_source=vaani&utm_medium=referral',
      licenseUrl,
    },
  },
  'te.lex.water': {
    url: '/media/telugu/beginner/water.jpg',
    query: 'clear glass of drinking water',
    attribution: {
      creator: 'manu schwendener',
      creatorUrl:
        'https://unsplash.com/@manuschwendener?utm_source=vaani&utm_medium=referral',
      sourceName: 'Unsplash',
      sourceUrl:
        'https://unsplash.com/photos/zFEY4DP4h6c?utm_source=vaani&utm_medium=referral',
      licenseUrl,
    },
  },
  'te.lex.tea': {
    url: '/media/telugu/beginner/tea.jpg',
    query: 'single cup of tea',
    attribution: {
      creator: 'Sixteen Miles Out',
      creatorUrl:
        'https://unsplash.com/@sixteenmilesout?utm_source=vaani&utm_medium=referral',
      sourceName: 'Unsplash',
      sourceUrl:
        'https://unsplash.com/photos/lzQCA9sWpw0?utm_source=vaani&utm_medium=referral',
      licenseUrl,
    },
  },
  'te.lex.coffee': {
    url: '/media/telugu/beginner/coffee.jpg',
    query: 'single cup of coffee',
    attribution: {
      creator: 'Ante Samarzija',
      creatorUrl:
        'https://unsplash.com/@antesamarzija?utm_source=vaani&utm_medium=referral',
      sourceName: 'Unsplash',
      sourceUrl:
        'https://unsplash.com/photos/lsmu0rUhUOk?utm_source=vaani&utm_medium=referral',
      licenseUrl,
    },
  },
  'te.lex.rice-food': {
    url: '/media/telugu/beginner/rice.jpg',
    query: 'plain cooked rice in a bowl',
    attribution: {
      creator: 'Pille R. Priske',
      creatorUrl:
        'https://unsplash.com/@pillepriske?utm_source=vaani&utm_medium=referral',
      sourceName: 'Unsplash',
      sourceUrl:
        'https://unsplash.com/photos/xmuIgjuQG0M?utm_source=vaani&utm_medium=referral',
      licenseUrl,
    },
  },
};

export function mediaForConcept(input: {
  id: string;
  topic?: string;
  english?: string;
  imageUrl?: string;
}): ConceptMedia | undefined {
  const topic = (input.topic ?? '').toLowerCase();
  const selected = curated[input.id];
  if (
    !selected &&
    !input.imageUrl &&
    !VISUAL_TOPICS.some((candidate) => topic.includes(candidate))
  )
    return undefined;
  const subject = (input.english ?? '').split(/[/(,]/)[0].trim();
  const category: NonNullable<ConceptMedia['intent']>['category'] =
    topic.includes('action')
      ? 'action'
      : topic.includes('animal')
        ? 'animal'
        : /people|family|body/.test(topic)
          ? 'person'
          : /place|travel/.test(topic)
            ? 'place'
            : 'object';
  const isolated = category === 'object' || category === 'animal';
  const framing =
    category === 'action'
      ? 'full body clear action'
      : category === 'animal'
        ? 'full body clearly visible'
        : topic.includes('transport')
          ? 'side view clearly visible'
          : topic.includes('clothing')
            ? 'front view clearly visible'
            : 'clearly visible subject';
  const query =
    selected?.query ??
    `${isolated ? 'single ' : ''}${subject} ${framing}${category === 'object' ? ' uncluttered background' : ''}`;
  const intent = {
    subject,
    category,
    framing,
    isolated,
    allowPeople:
      category === 'action' || category === 'person' || category === 'place',
    exclude: [
      'diagram',
      'logo',
      'map',
      'screenshot',
      'scan',
      'collage',
      'painting',
      'illustration',
    ],
  };
  return {
    intent,
    presentation: { fit: isolated ? 'contain' : 'cover', position: 'center' },
    kind: 'image',
    key: input.id,
    alt: `Photograph representing ${input.english ?? input.id}`,
    url: selected?.url ?? input.imageUrl,
    fallback: '/media/learning-image-placeholder.svg',
    query,
    source: selected ? 'local' : input.imageUrl ? 'authored' : 'placeholder',
    ...(selected?.attribution ? { attribution: selected.attribution } : {}),
  };
}
