import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  Course,
  CoursePresentation,
  Session,
  Target,
} from '../course/types/course.types';
import {
  currentCoursePresentation,
  presentTarget,
} from '../course/services/presentation';
import { courseService } from '../course/services/course.service';
import { AuthContext } from '../auth/components/AuthProvider';
import { CourseHome } from '../course/pages/CourseHome';
import { browserAudio } from '../listening/services/audio';
import { browserSpeech } from '../speaking/services/speech';
import { SessionPage } from './pages/SessionPage';
import { TargetPresentation } from './components/TargetPresentation';
import { SentenceBuilder } from './components/SentenceBuilder';
import { ConversationActivity } from './components/ConversationActivity';

const water: Target = {
  id: 'te.lex.water',
  family: 'lexicalConcepts',
  level: 'A0',
  telugu: 'నీళ్లు',
  romanization: 'neellu',
  meaning: { en: 'water' },
  prompt: { en: 'water' },
  glosses: [],
  register: 'neutral',
  reviewStatus: 'model_reviewed',
  openResponse: false,
  media: {
    kind: 'image',
    key: 'te.lex.water',
    alt: 'A clear glass of water',
    url: '/media/telugu/beginner/water.jpg',
    fallback: '/media/learning-image-placeholder.svg',
    query: 'clear glass of water',
    source: 'local',
  },
};
const tea: Target = {
  ...water,
  id: 'te.lex.tea',
  telugu: 'టీ',
  romanization: 'tee',
  meaning: { en: 'tea' },
  media: {
    ...water.media!,
    key: 'te.lex.tea',
    alt: 'A cup of tea',
    url: '/media/telugu/beginner/tea.jpg',
  },
};
const want: Target = {
  ...water,
  id: 'te.lex.want-need',
  telugu: 'కావాలి',
  romanization: 'kaavaali',
  meaning: { en: 'want / need' },
  media: undefined,
};
const session = (type = 'meaning_recognition'): Session => ({
  id: 'session',
  status: 'active',
  version: 0,
  cursor: 4,
  total: 20,
  allowance: 5,
  level: 'A0',
  presentation: currentCoursePresentation,
  summary: {
    introduced: 3,
    attempts: 2,
    independent: 2,
    speaking: 1,
    listening: 1,
    reviews: 0,
    minutes: 4,
  },
  activity: {
    id: 'step-5',
    conceptId: want.id,
    type,
    phase: 'practice',
    dimension: 'meaning_recognition',
    prompt: 'What does it mean?',
    target: null,
    stimulus: { telugu: want.telugu, romanization: want.romanization },
    audio: null,
    openResponse: false,
    canReveal: true,
    hinted: false,
    support: { romanizationDefault: true },
  },
});
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/app/session/session']}>
      <Routes>
        <Route path="/app/session/:id" element={<SessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
afterEach(() => vi.restoreAllMocks());
const technicalLanguage =
  /model response|canonical response|unverified|semantic match|verification|confidence|attempt classification|expected payload|evidence|rubric/iu;

describe('consumer learning interactions', () => {
  it('shows a retrieval cue and photograph when a resumed session starts with due review', async () => {
    const s = session('delayed_recall');
    s.activity = {
      ...s.activity!,
      conceptId: water.id,
      phase: 'review',
      dimension: 'delayed_recall',
      stimulus: null,
      recallCue: 'water',
      mediaCue: water.media,
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    mount();
    expect(await screen.findByText('water')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/media/telugu/beginner/water.jpg',
    );
    expect(screen.queryByLabelText('Your response')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Speak Telugu' }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /Remember|Practise|Bring it to mind|Make it familiar|A little practice/u,
    );
    expect(screen.queryByText(water.telugu)).not.toBeInTheDocument();
    expect(screen.queryByText(water.romanization)).not.toBeInTheDocument();
  });

  it.each([
    ['correct', 'Correct', 'Continue'],
    ['nearly_correct', 'Almost — check the spelling.', 'Try again'],
    ['incorrect', 'Try again', 'Try again'],
  ] as const)(
    'shows %s feedback without exposing engine terminology',
    async (classification, message, button) => {
      const s = session(
        classification === 'nearly_correct'
          ? 'writing_recall'
          : 'meaning_recognition',
      );
      vi.spyOn(courseService, 'session').mockResolvedValue(s);
      vi.spyOn(courseService, 'act').mockResolvedValue({
        session: s,
        feedback: message,
        classification,
        target: want,
        evidence: classification === 'correct' ? 'independent' : 'incorrect',
      });
      mount();
      await userEvent.type(
        await screen.findByLabelText('Your response'),
        classification === 'nearly_correct' ? 'wnat' : 'need',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Check' }));
      expect(
        await screen.findByText(message, {
          selector: '.learning-feedback span',
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: button })).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(technicalLanguage);
      if (classification !== 'correct') {
        expect(
          screen.queryByText('Answer: want / need'),
        ).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole('button', { name: 'Try again' }),
        );
        expect(screen.getByLabelText('Your response')).toBeInTheDocument();
        expect(
          screen.getByRole('heading', {
            name:
              classification === 'nearly_correct'
                ? 'Write this in Telugu'
                : 'Meaning',
          }),
        ).toBeInTheDocument();
      } else
        expect(screen.getByText('Answer: want / need')).toBeInTheDocument();
    },
  );
  it('reveals the localized answer only after asking for help', async () => {
    const s = session();
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: {
        ...s,
        activity: { ...s.activity!, target: want, hinted: true },
      },
      feedback: '',
      target: want,
    });
    mount();
    await screen.findByLabelText('Your response');
    expect(screen.queryByText('want / need')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal meaning / romanization' }),
    );
    expect(await screen.findByText('Answer: want / need')).toBeInTheDocument();
    expect(courseService.act).toHaveBeenCalledWith(
      'session',
      expect.objectContaining({ action: 'hint' }),
    );
  });
  it('keeps listening transcripts hidden, renders real photo choices, and records selection with restrained feedback', async () => {
    const s = session('audio_image_recognition');
    s.activity = {
      ...s.activity!,
      conceptId: water.id,
      choiceMode: 'media',
      choices: [water, tea],
      audio: {
        text: water.telugu,
        language: 'te-IN',
        speed: 'clear',
        url: null,
      },
      stimulus: null,
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: s,
      feedback: 'Correct',
      classification: 'correct',
      target: water,
    });
    mount();
    const option = await screen.findByRole('button', {
      name: 'Image option 1',
    });
    expect(option.querySelector('img')).toHaveAttribute(
      'src',
      '/media/telugu/beginner/water.jpg',
    );
    expect(option.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByText(water.telugu)).not.toBeInTheDocument();
    expect(screen.queryByText('water')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play Telugu audio' }),
    ).toBeInTheDocument();
    option.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    expect(option).toHaveAttribute('aria-pressed', 'true');
    expect(option).toHaveAttribute('data-feedback', 'correct');
    expect(courseService.act).toHaveBeenCalledWith(
      'session',
      expect.objectContaining({ response: water.id }),
    );
  });
  it('offers known word choices as an accessible alternative to photographs', async () => {
    const s = session('audio_image_recognition');
    s.activity = {
      ...s.activity!,
      choiceMode: 'media',
      choices: [water, tea],
      stimulus: null,
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: s,
      feedback: 'Correct',
      classification: 'correct',
      target: water,
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use word choices' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Image option 1' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /నీళ్లు/u }));
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    expect(courseService.act).toHaveBeenCalledWith(
      'session',
      expect.objectContaining({ response: water.id }),
    );
  });
  it('keeps the chosen photograph present after an incorrect response and allows retry', async () => {
    const s = session('audio_image_recognition');
    s.activity = {
      ...s.activity!,
      choices: [water, tea],
      choiceMode: 'media',
      stimulus: null,
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: s,
      feedback: 'Try again',
      classification: 'incorrect',
      target: want,
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Image option 2' }),
    );
    expect(
      await screen.findByText('Try again', {
        selector: '.learning-feedback span',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Image option 2' }),
    ).toHaveAttribute('data-feedback', 'incorrect');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      screen.getByRole('button', { name: 'Image option 2' }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Image option 2' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
  it('shows speaking states, captures a useful response, and uses the configured speech locale', async () => {
    const s = session('spoken_recall');
    s.activity = {
      ...s.activity!,
      stimulus: null,
      dimension: 'spoken_production',
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: s,
      feedback: 'Correct',
      classification: 'correct',
      target: want,
    });
    let text: (value: string) => void = () => {};
    let end: () => void = () => {};
    const speech = vi
      .spyOn(browserSpeech, 'start')
      .mockImplementation((onText, _onError, onEnd) => {
        text = onText;
        end = onEnd;
        return () => {};
      });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Speak Telugu' }),
    );
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stop recording' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(speech).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      'te-IN',
    );
    act(() => {
      text('కావాలి');
      end();
    });
    await waitFor(() =>
      expect(courseService.act).toHaveBeenCalledWith(
        'session',
        expect.objectContaining({ response: 'కావాలి', inputMode: 'speech' }),
      ),
    );
    expect(screen.queryByLabelText('Your response')).not.toBeInTheDocument();
  });
  it('offers speaking self-check when audio or microphone access fails', async () => {
    const s = session('spoken_recall');
    s.activity = {
      ...s.activity!,
      stimulus: null,
      audio: {
        text: want.telugu,
        language: 'te-IN',
        speed: 'clear',
        url: null,
      },
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(browserAudio, 'play').mockRejectedValue(
      new Error('internal provider detail'),
    );
    vi.spyOn(browserSpeech, 'start').mockImplementation((_onText, onError) => {
      onError(
        'Voice input is not available here. Say it aloud, or type your answer.',
      );
      return () => {};
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Play Telugu audio' }),
    );
    expect(
      await screen.findByText(
        'Audio is not available here yet. You can keep practising with the text.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('internal provider detail'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Speak Telugu' }));
    expect(screen.queryByLabelText('Your response')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Listen and repeat' }),
    ).toBeEnabled();
    expect(document.body.textContent).not.toMatch(technicalLanguage);
  });
  it('keeps oral self-check available without making typing the fallback default', async () => {
    const s = session('spoken_recall');
    s.activity = { ...s.activity!, stimulus: null, mediaCue: water.media };
    const hinted = {
      ...s,
      activity: { ...s.activity!, target: water, hinted: true },
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockImplementation(async (_id, input) =>
      (input as { action: string }).action === 'hint'
        ? { session: hinted, target: water, feedback: '' }
        : {
            session: hinted,
            target: water,
            classification: 'correct',
            evidence: 'self_reported',
            feedback: 'Continue',
          },
    );
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Listen and repeat' }),
    );
    expect(await screen.findByText('neellu')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your response')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I said it' }));
    expect(courseService.act).toHaveBeenCalledWith(
      'session',
      expect.objectContaining({ inputMode: 'self', selfRating: 'good' }),
    );
  });
  it('shows a writing field only when writing is explicitly requested', async () => {
    const s = session('writing_recall');
    s.activity = { ...s.activity!, stimulus: null, mediaCue: water.media };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Write this in Telugu' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Your response')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Speak Telugu' }),
    ).not.toBeInTheDocument();
  });
  it('submits only the learner-constructed sentence from server-provided tiles', async () => {
    const s = session('sentence_construction');
    s.activity = {
      ...s.activity!,
      stimulus: null,
      tiles: [
        { id: 'want', text: 'కావాలి' },
        { id: 'water', text: 'నీళ్లు' },
        { id: 'me', text: 'నాకు' },
      ],
    };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: s,
      feedback: 'Correct',
      classification: 'correct',
      target: null,
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add నాకు' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add నీళ్లు' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add కావాలి' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(courseService.act).toHaveBeenCalledWith(
      'session',
      expect.objectContaining({ response: 'నాకు నీళ్లు కావాలి' }),
    );
  });
  it('shows meaningful session progress without exposing records or scoring internals', async () => {
    vi.spyOn(courseService, 'session').mockResolvedValue(session());
    mount();
    expect(await screen.findByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '20',
    );
    expect(document.body.textContent).not.toMatch(
      /step-5|meaning_recognition|A0|mastery|SRS/iu,
    );
  });
});

describe('language-independent support and primitives', () => {
  const languages: CoursePresentation = {
    targetLanguage: {
      code: 'xx',
      name: 'Target language',
      speechLocale: 'xx-XY',
      hasRomanization: true,
    },
    baseLanguage: { code: 'zz', name: 'Base language' },
  };
  const authored = {
    ...water,
    telugu: 'target words',
    romanization: 'sound guide',
    media: undefined,
    meaning: { en: 'English fallback', zz: 'localized support' },
  };
  it('selects configured content languages, with meaning and pronunciation revealable', async () => {
    const target = presentTarget(authored, languages);
    render(
      <TargetPresentation
        target={target}
        languages={languages}
        romanizationDefault={false}
      />,
    );
    expect(screen.getByText('target')).toBeInTheDocument();
    expect(screen.queryByText('localized support')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Meaning' }));
    expect(screen.getByText('localized support')).toHaveAttribute('lang', 'zz');
    await userEvent.click(
      screen.getByRole('button', { name: 'Show pronunciation' }),
    );
    expect(screen.getByText('sound guide')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/English|Telugu/iu);
  });
  it('does not require romanization for a course without that capability', () => {
    const config = {
      ...languages,
      targetLanguage: { ...languages.targetLanguage, hasRomanization: false },
    };
    render(
      <TargetPresentation
        target={presentTarget(authored, config)}
        languages={config}
        teaching
      />,
    );
    expect(screen.queryByText('sound guide')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show pronunciation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('localized support')).toBeInTheDocument();
  });
  it('supports adding and removing sentence tiles with keyboard controls', async () => {
    const tiles = [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
    ];
    function Builder() {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <SentenceBuilder
          tiles={tiles}
          selected={selected}
          onChange={setSelected}
          language="xx"
        />
      );
    }
    render(<Builder />);
    screen.getByRole('button', { name: 'Add one' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Add one' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove one' }));
    expect(screen.getByRole('button', { name: 'Add one' })).not.toBeDisabled();
  });
  it('presents a conversation with localized optional support and separate turn audio', async () => {
    const play = vi.fn();
    render(
      <ConversationActivity
        languages={languages}
        showRomanization
        turns={[
          {
            speaker: 'A',
            targetText: 'first turn',
            romanization: 'first sound',
            localizedMeaning: 'meaning one',
            meanings: { zz: 'meaning one' },
          },
          {
            speaker: 'B',
            targetText: 'second turn',
            localizedMeaning: 'meaning two',
            meanings: { zz: 'meaning two' },
          },
        ]}
        onAudio={play}
      />,
    );
    expect(screen.queryByText('meaning one')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Meaning' })[0]!,
    );
    expect(screen.getByText('meaning one')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Listen to turn 2' }),
    );
    expect(play).toHaveBeenCalledWith('second turn');
  });
  it('keeps course home focused on one continuous course and starts directly', async () => {
    const s = session();
    const course: Course = {
      id: 'course',
      title: 'Telugu Course',
      baseLanguage: 'en',
      presentation: currentCoursePresentation,
      preview: [water, tea],
      activeSession: null,
      progress: {
        level: 'A0',
        completedC2: false,
        introduced: 0,
        lexicalIntroduced: 0,
        due: 0,
        weak: 0,
        listening: 0,
        speaking: 0,
        delayedRetention: 0,
        nextCheckpoint: [],
        pendingAssessments: 0,
      },
    };
    vi.spyOn(courseService, 'home').mockResolvedValue(course);
    vi.spyOn(courseService, 'start').mockResolvedValue(s);
    render(
      <AuthContext.Provider
        value={{
          user: null,
          loading: false,
          authenticate: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<CourseHome />} />
            <Route
              path="/app/session/:id"
              element={<p>Learning starts here</p>}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Telugu Course' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Continue Telugu' }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.getByRole('img', { name: 'A clear glass of water' }),
    ).toHaveAttribute('src', '/media/telugu/beginner/water.jpg');
    expect(document.body.textContent).not.toMatch(technicalLanguage);
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue Telugu' }),
    );
    expect(await screen.findByText('Learning starts here')).toBeInTheDocument();
  });
});
