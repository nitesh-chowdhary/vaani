# Speaking progression verification

Accepted typed oral fallback advances with recall evidence, never verified speech. Technical recognition problems and skipping do not penalize mastery or pacing. Successful isolated recall suppresses redundant practice; subsequent authored sentence/context/dialogue use increases demonstrated knowledge depth. SRS timing is unchanged; compatible memory reviews use introduced, dependency-safe higher-order targets and overlapping requests merge.

## Deterministic comparison

Traces use the same canonical content and all-correct response scenario. The before trace was captured before this change. Regenerate after with `npm run build -w @vaani/learning-core` and `node scripts/trace-learner.mjs docs/learner-traces/after.json`. These traces describe planner sequencing, not real microphone accuracy. Contextual counts overlap sentence counts; they are not separate percentages.

| Metric                 |   Before: 100 |    After: 100 |     After: 50 |
| ---------------------- | ------------: | ------------: | ------------: |
| isolatedVocabulary     |            42 |            43 |            24 |
| uniqueVocabulary       |            11 |            15 |             8 |
| sentences              |            56 |            50 |            19 |
| uniqueSentences        |            10 |            10 |             4 |
| spokenWords            |            20 |            14 |             8 |
| spokenSentences        |            27 |            20 |             7 |
| contextualOrDialogue   |            23 |            16 |             9 |
| dialogueTurns          |             0 |             2 |             2 |
| highestIsolatedRepeat  |             5 |             3 |             3 |
| averageIsolatedRepeats |          3.82 |          2.87 |             3 |
| firstSpokenWord        |             3 |             3 |             3 |
| firstSpokenSentence    |            11 |            11 |            11 |
| firstQuestionResponse  | Not available | Not available | Not available |
| firstDialogue          | Not available |            21 |            21 |

Total isolated activities did not fall (42 → 43), because more new vocabulary was introduced (11 → 15). Maximum isolated appearances per concept fell from 5 to 3; average from 3.82 to 2.87. Introductions account for 15 of the first 100 activities. Sentences account for 50 and include contextual retrieval; dialogue appears at activity 21. This is not a claim that every desired communicative function is covered.

## First 50 after activities

|   # | Interaction              | Authored target                   |
| --: | ------------------------ | --------------------------------- |
|   1 | concept_introduction     | నీళ్లు                            |
|   2 | audio_target_recognition | నీళ్లు                            |
|   3 | spoken_recall            | నీళ్లు                            |
|   4 | concept_introduction     | కావాలి                            |
|   5 | audio_target_recognition | కావాలి                            |
|   6 | contextual_recall        | కావాలి                            |
|   7 | concept_introduction     | నాకు ___ కావాలి.                  |
|   8 | context_recognition      | నాకు ___ కావాలి.                  |
|   9 | combination_introduction | నాకు నీళ్లు కావాలి.               |
|  10 | audio_target_recognition | నాకు నీళ్లు కావాలి.               |
|  11 | shadow                   | నాకు నీళ్లు కావాలి.               |
|  12 | sentence_construction    | నాకు నీళ్లు కావాలి.               |
|  13 | contextual_recall        | నాకు నీళ్లు కావాలి.               |
|  14 | concept_introduction     | సరే                               |
|  15 | audio_target_recognition | సరే                               |
|  16 | contextual_recall        | సరే                               |
|  17 | concept_introduction     | థాంక్స్                           |
|  18 | audio_target_recognition | థాంక్స్                           |
|  19 | contextual_recall        | థాంక్స్                           |
|  20 | combination_introduction | నాకు నీళ్లు కావాలి. సరే. థాంక్స్. |
|  21 | roleplay_a               | నాకు నీళ్లు కావాలి. సరే. థాంక్స్. |
|  22 | roleplay_b               | నాకు నీళ్లు కావాలి. సరే. థాంక్స్. |
|  23 | concept_introduction     | ఆఫీస్                             |
|  24 | audio_image_recognition  | ఆఫీస్                             |
|  25 | spoken_recall            | ఆఫీస్                             |
|  26 | concept_introduction     | ఎక్కడ?                            |
|  27 | audio_target_recognition | ఎక్కడ?                            |
|  28 | contextual_recall        | ఎక్కడ?                            |
|  29 | concept_introduction     | ___ ఎక్కడ ఉంది?                   |
|  30 | context_recognition      | ___ ఎక్కడ ఉంది?                   |
|  31 | combination_introduction | ఆఫీస్ ఎక్కడ ఉంది?                 |
|  32 | audio_target_recognition | ఆఫీస్ ఎక్కడ ఉంది?                 |
|  33 | shadow                   | ఆఫీస్ ఎక్కడ ఉంది?                 |
|  34 | sentence_construction    | ఆఫీస్ ఎక్కడ ఉంది?                 |
|  35 | contextual_recall        | ఆఫీస్ ఎక్కడ ఉంది?                 |
|  36 | concept_introduction     | టీ                                |
|  37 | audio_image_recognition  | టీ                                |
|  38 | spoken_recall            | టీ                                |
|  39 | combination_introduction | నాకు టీ కావాలి.                   |
|  40 | audio_target_recognition | నాకు టీ కావాలి.                   |
|  41 | shadow                   | నాకు టీ కావాలి.                   |
|  42 | sentence_construction    | నాకు టీ కావాలి.                   |
|  43 | contextual_recall        | నాకు టీ కావాలి.                   |
|  44 | concept_introduction     | మార్కెట్                          |
|  45 | audio_image_recognition  | మార్కెట్                          |
|  46 | spoken_recall            | మార్కెట్                          |
|  47 | combination_introduction | మార్కెట్ ఎక్కడ ఉంది?              |
|  48 | audio_target_recognition | మార్కెట్ ఎక్కడ ఉంది?              |
|  49 | shadow                   | మార్కెట్ ఎక్కడ ఉంది?              |
|  50 | sentence_construction    | మార్కెట్ ఎక్కడ ఉంది?              |

## Content boundary

The current dependency audit finds 32/103 safe A0 sentences, 7/398 A1, and 0/275 A2; safe dialogues are 1/3 A0, 0/21 A1, and 0/2 A2. There is no validated dependency-safe early question/response exchange, so no first question-response index is claimed. The existing safe micro-dialogue supports requests, but broader question/response coverage requires authored dependency/content work. No new Telugu or master edits were introduced.

## Verification boundaries

Core simulations cover 100 accepted speech responses and 100 typed oral fallback responses with recognition failures. Integration tests check advancement, recall-only evidence, technical error isolation and non-penalizing skip. Playwright exercises 50 activities plus separate 30-activity all-typed-ASR-error flows on desktop and 390px mobile, image outage and stalled microphone escape paths. Real human microphone accuracy remains a manual check.

Final checks: 123 learning-core, 87 API and 73 frontend tests passed; 12 Playwright tests passed. The API fallback test exhausts and finishes an entire five-minute planned session without speech verification. Typecheck, lint, production build and content validation passed. Master content hash remains unchanged. Changed-file formatting passed; the repository-wide check still flags 25 untouched files.

Playwright screenshots were visually inspected for introduction photographs, oral fallback, sentence construction, dialogue and mobile choice feedback. A longer mobile answer exposed a 28px action shift; the hidden reinforcement and feedback slots now reserve actual answer geometry, and the unchanged layout assertion passes. Artifacts are generated under `test-results/e2e/` and `playwright-report/` (ignored by Git). Healthy learner runs reported no unexpected application console or API errors.
