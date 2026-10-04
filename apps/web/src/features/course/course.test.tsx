import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GlossText } from './components/GlossText';
import { ConceptMediaView } from './components/ConceptMedia';
import { mediaProvider } from './services/media-provider';
import { browserAudio } from '../listening/services/audio';
import { SessionPage } from '../session/pages/SessionPage';
import { courseService } from './services/course.service';
import type { Session, Target } from './types/course.types';
const target: Target = {
  id: 'te.lex.water',
  family: 'lexicalConcepts',
  level: 'A0',
  telugu: 'నీళ్లు',
  romanization: 'neellu',
  meaning: { en: 'water' },
  prompt: { en: 'water' },
  glosses: [],
  media: {
    kind: 'image',
    key: 'te.lex.water',
    alt: 'Photograph representing water',
    url: '/media/telugu/beginner/water.jpg',
    fallback: '/media/learning-image-placeholder.svg',
    query: 'clear glass of drinking water',
    source: 'local',
    attribution: {
      creator: 'manu schwendener',
      creatorUrl: 'https://unsplash.com/@manuschwendener',
      sourceName: 'Unsplash',
      sourceUrl: 'https://unsplash.com/photos/zFEY4DP4h6c',
      licenseUrl: 'https://unsplash.com/license',
    },
  },
  register: 'neutral',
  reviewStatus: 'model_reviewed',
  openResponse: false,
};
const session = (phase: 'exposure' | 'practice' = 'exposure'): Session => ({
  id: 'session',
  status: 'active',
  version: 0,
  cursor: 0,
  total: 5,
  allowance: 5,
  level: 'A0',
  summary: {
    introduced: 1,
    attempts: 1,
    independent: 1,
    speaking: 1,
    listening: 1,
    reviews: 0,
    minutes: 5,
  },
  activity: {
    id: 'a1',
    conceptId: target.id,
    type: phase === 'exposure' ? 'introduction' : 'spoken_recall',
    phase,
    dimension: 'spoken_production',
    prompt: phase === 'exposure' ? 'Meet this expression' : 'Say it',
    target: phase === 'exposure' ? target : null,
    stimulus: null,
    audio: null,
    openResponse: false,
    canReveal: true,
    hinted: false,
  },
});
function mount() {
  return render(
    <MemoryRouter initialEntries={['/app/session/session']}>
      <Routes>
        <Route path="/app/session/:id" element={<SessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
afterEach(() => vi.restoreAllMocks());
describe('continuous session UI', () => {
  it('preserves the resolved photograph when playing audio refreshes the session metadata', async () => {
    const media = {
      ...target.media!,
      url: undefined,
      source: 'placeholder' as const,
    };
    const s = session();
    s.activity!.target = { ...target, media };
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: structuredClone(s),
      target: null,
      feedback: '',
    });
    const provider = vi.spyOn(mediaProvider, 'resolve').mockResolvedValue({
      ...media,
      url: 'https://example.com/water.jpg',
      source: 'remote',
    });
    vi.spyOn(browserAudio, 'play').mockImplementation(
      async (_request, onStarted) => onStarted(),
    );
    mount();
    const image = await screen.findByRole('img', {
      name: 'Photograph representing water',
    });
    await waitFor(() =>
      expect(image).toHaveAttribute('src', 'https://example.com/water.jpg'),
    );
    fireEvent.load(image);
    await userEvent.click(
      screen.getByRole('button', { name: 'Play Telugu audio' }),
    );
    await waitFor(() =>
      expect(courseService.act).toHaveBeenCalledWith(
        'session',
        expect.objectContaining({ action: 'audio' }),
      ),
    );
    expect(image).toHaveAttribute('src', 'https://example.com/water.jpg');
    expect(screen.queryByText('Loading photo…')).not.toBeInTheDocument();
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('keeps a loaded photograph visible when equivalent media metadata is rerendered', () => {
    const view = render(<ConceptMediaView media={target.media!} />);
    const image = screen.getByRole('img', {
      name: 'Photograph representing water',
    });
    expect(screen.getByRole('status').parentElement).not.toBe(
      image.parentElement,
    );
    fireEvent.load(image);
    view.rerender(<ConceptMediaView media={{ ...target.media! }} />);
    expect(image).toHaveAttribute('src', '/media/telugu/beginner/water.jpg');
    expect(screen.queryByText('Loading photo…')).not.toBeInTheDocument();
  });
  it('first exposure shows the real photograph, Telugu, romanization and English before recall', async () => {
    vi.spyOn(courseService, 'session').mockResolvedValue(session());
    mount();
    expect(await screen.findByText('water')).toBeInTheDocument();
    expect(screen.getByText('neellu')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Photograph representing water' }),
    ).toHaveAttribute('src', '/media/telugu/beginner/water.jpg');
    expect(
      screen.getAllByRole('button', { name: 'Meaning of నీళ్లు' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('I need water.')).not.toBeInTheDocument();
  });
  it('keeps photo credits hidden until requested and gives images intrinsic dimensions', async () => {
    render(<ConceptMediaView media={target.media!} />);
    const image = screen.getByRole('img', {
      name: 'Photograph representing water',
    });
    expect(image).toHaveAttribute('width', '1200');
    expect(image).toHaveAttribute('height', '800');
    const credits = screen
      .getByLabelText('Photo information')
      .closest('details');
    expect(credits).not.toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'License' })).not.toBeVisible();
    await userEvent.click(screen.getByLabelText('Photo information'));
    expect(credits).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'License' })).toBeVisible();
  });
  it('uses authored fit and focal position without cropping every subject', () => {
    render(
      <ConceptMediaView
        media={{
          ...target.media!,
          presentation: { fit: 'contain', position: '40% 50%' },
        }}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Photograph representing water' }),
    ).toHaveStyle({ objectFit: 'contain', objectPosition: '40% 50%' });
  });
  it('shows a loading state and switches to the neutral SVG fallback when a photograph fails', () => {
    const view = render(<ConceptMediaView media={target.media!} />);
    expect(screen.getByText('Loading photo…')).toBeInTheDocument();
    const image = screen.getByRole('img', {
      name: 'Photograph representing water',
    });
    fireEvent.error(image);
    expect(image).toHaveAttribute(
      'src',
      '/media/learning-image-placeholder.svg',
    );
    expect(screen.getByText('Photograph unavailable.')).toBeInTheDocument();
    fireEvent.load(image);
    expect(screen.queryByText('Loading photo…')).not.toBeInTheDocument();
    view.unmount();
  });
  it('resolves query metadata through the replaceable photo provider and shows its license credit', async () => {
    const media = {
      ...target.media!,
      alt: 'Photograph representing a doctor',
      url: undefined,
      source: 'placeholder' as const,
      query: 'doctor health',
    };
    vi.spyOn(mediaProvider, 'resolve').mockResolvedValue({
      ...media,
      url: 'https://thumb.wikimedia.org/doctor.jpg',
      source: 'remote',
      attribution: {
        creator: 'A Photographer',
        sourceName: 'Wikimedia Commons',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Doctor.jpg',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
        licenseName: 'CC BY 4.0',
      },
    });
    render(<ConceptMediaView media={media} />);
    const image = screen.getByRole('img', {
      name: 'Photograph representing a doctor',
    });
    await waitFor(() =>
      expect(image).toHaveAttribute(
        'src',
        'https://thumb.wikimedia.org/doctor.jpg',
      ),
    );
    await userEvent.click(screen.getByLabelText('Photo information'));
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0',
    );
    expect(mediaProvider.resolve).toHaveBeenCalledWith(
      media,
      expect.any(AbortSignal),
    );
  });
  it('recall hides the target and meaning until an explicit reveal, then keeps romanization accessible', async () => {
    const s = session('practice');
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: { ...s, activity: { ...s.activity!, target, hinted: true } },
      target,
      feedback: '',
    });
    mount();
    await screen.findByText('Say it');
    expect(screen.queryByText('neellu')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Reveal meaning / romanization' }),
    );
    expect(await screen.findByText('neellu')).toBeInTheDocument();
    expect(courseService.act).toHaveBeenCalledWith(
      'session',
      expect.objectContaining({ action: 'hint' }),
    );
  });
  it('supports hover, keyboard focus, and tap chunk glosses without inventing token meanings', async () => {
    render(
      <GlossText
        language="en"
        text="నీళ్లు"
        meaning={{ en: 'water' }}
        romanization="neellu"
      />,
    );
    const word = screen.getByRole('button', { name: 'Meaning of నీళ్లు' });
    await userEvent.hover(word);
    expect(screen.getByRole('tooltip')).toHaveTextContent('water');
    await userEvent.unhover(word);
    await userEvent.click(word);
    expect(screen.getByRole('tooltip')).toHaveTextContent('neellu');
  });
  it('advances after explanation and reload resumes the saved activity', async () => {
    const next = session('practice');
    vi.spyOn(courseService, 'session')
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(next);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: next,
      target,
      feedback: '',
    });
    const first = mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'I understand — continue' }),
    );
    expect(await screen.findByText('Say it')).toBeInTheDocument();
    first.unmount();
    mount();
    expect(await screen.findByText('Say it')).toBeInTheDocument();
  });
  it('shows feedback before continuing to the next activity', async () => {
    const s = session('practice');
    vi.spyOn(courseService, 'session').mockResolvedValue(s);
    vi.spyOn(courseService, 'act').mockResolvedValue({
      session: {
        ...s,
        activity: {
          ...s.activity!,
          id: 'next',
          type: 'context_response',
          prompt: 'Next activity',
        },
      },
      target,
      feedback: 'Correct.',
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Type instead' }),
    );
    await userEvent.type(
      await screen.findByLabelText('Your response'),
      'neellu',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Correct.')).toBeInTheDocument();
    expect(screen.queryByText('Next activity')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('button', { name: 'Speak Telugu' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Next activity')).not.toBeInTheDocument();
  });
  it('finishes with a summary and offers the continuous course', async () => {
    vi.spyOn(courseService, 'session').mockResolvedValue(session());
    vi.spyOn(courseService, 'finish').mockResolvedValue({
      ...session(),
      status: 'completed',
      activity: null,
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Finish session' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Session summary' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: 'Continue Telugu' }),
    ).toHaveAttribute('href', '/app');
  });
});
