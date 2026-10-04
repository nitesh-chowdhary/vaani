import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConceptMedia } from '@vaani/learning-core';
import { mediaProvider } from '../services/media-provider';
import { LearningIcon } from './LearningIcon';

export function ConceptMediaView({
  media,
  hideMeaning = false,
  eager = false,
  selection,
  onUnavailable,
}: {
  media: ConceptMedia;
  hideMeaning?: boolean;
  eager?: boolean;
  fallbackLabel?: string;
  onUnavailable?: () => void;
  selection?: {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    selected?: boolean;
    outcome?: string;
    resolved?: boolean;
  };
}) {
  const mediaSignature = JSON.stringify(media);
  const stableMedia = useMemo<ConceptMedia>(
    () => JSON.parse(mediaSignature) as ConceptMedia,
    [mediaSignature],
  );
  const [selected, setSelected] = useState(media);
  const [src, setSrc] = useState(media.url ?? media.fallback);
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const [resolving, setResolving] = useState(false);
  const loading = loadedSrc !== src || resolving;
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    const effectGeneration = ++generation.current;
    attempted.current.clear();
    setSelected(stableMedia);
    setSrc(stableMedia.url ?? stableMedia.fallback);
    setFailed(false);
    setResolving(!stableMedia.url && !!stableMedia.query);
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (!stableMedia.url && stableMedia.query) {
      timeout = setTimeout(() => {
        controller.abort();
        setResolving(false);
        setFailed(true);
        unavailable.current?.();
      }, 10000);
      void mediaProvider
        .resolve(stableMedia, controller.signal)
        .then((resolved) => {
          if (controller.signal.aborted) return;
          if (!resolved.url) throw new Error('No photograph found.');
          setSelected(resolved);
          setSrc(resolved.url);
          setResolving(false);
          clearTimeout(timeout);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setFailed(true);
          unavailable.current?.();
          setResolving(false);
          clearTimeout(timeout);
        });
    }
    return () => {
      generation.current = effectGeneration + 1;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [stableMedia]);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);

  const failImage = useCallback(() => {
    if (attempted.current.has(src)) {
      setFailed(true);
      unavailable.current?.();
      return;
    }
    attempted.current.add(src);
    const requestGeneration = generation.current;
    setResolving(true);
    void mediaProvider
      .resolve(stableMedia, undefined, src)
      .then((resolved) => {
        if (requestGeneration !== generation.current) return;
        setSelected(resolved);
        setSrc(resolved.url!);
        setResolving(false);
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setFailed(true);
        setResolving(false);
        unavailable.current?.();
      });
  }, [src, stableMedia]);
  useEffect(() => {
    if (!selected.url || loadedSrc === src || failed) return;
    const timer = setTimeout(failImage, 8000);
    return () => clearTimeout(timer);
  }, [selected.url, loadedSrc, src, failed, failImage]);

  if (failed) return null;

  const frame = (
    <>
      {selected.url && (
        <img
          ref={imageRef}
          src={src}
          alt={
            selection
              ? ''
              : hideMeaning
                ? 'Learning photograph for this prompt'
                : media.alt
          }
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          width={1200}
          height={800}
          className="h-full w-full"
          style={{
            objectFit: selected.presentation?.fit ?? 'contain',
            objectPosition: selected.presentation?.position ?? 'center',
          }}
          onLoad={() => setLoadedSrc(src)}
          onError={failImage}
        />
      )}
      {selection?.selected &&
        (selection.outcome === 'correct' ||
          selection.outcome === 'incorrect' ||
          selection.outcome === 'nearly_correct') && (
          <span
            className="choice-mark"
            aria-label={
              selection.outcome === 'correct' ? 'Correct' : 'Try again'
            }
          >
            <LearningIcon
              name={selection.outcome === 'correct' ? 'check' : 'refresh'}
            />
          </span>
        )}
    </>
  );
  return (
    <figure
      className="learning-photo"
      data-receded={
        selection?.resolved && !selection.selected ? 'true' : undefined
      }
    >
      {selection ? (
        <button
          type="button"
          className="photo-frame choice-photo"
          aria-label={selection.label}
          aria-pressed={!!selection.selected}
          data-state={
            selection.selected ? (selection.outcome ?? 'selected') : 'idle'
          }
          disabled={selection.disabled || loading}
          data-feedback={selection.selected ? selection.outcome : undefined}
          onClick={selection.onSelect}
        >
          {frame}
        </button>
      ) : (
        <div className="photo-frame">{frame}</div>
      )}
      {loading && !failed && (
        <p role="status" className={selection ? 'sr-only' : 'photo-status'}>
          Loading photo…
        </p>
      )}
      {selected.attribution ? (
        <details className="photo-credit">
          <summary aria-label="Photo information">
            <LearningIcon name="help" />
          </summary>
          <div className="photo-credit-content">
            Photo by{' '}
            <a
              className="hover:text-slate-300"
              href={
                selected.attribution.creatorUrl ??
                selected.attribution.sourceUrl
              }
              target="_blank"
              rel="noreferrer"
            >
              {selected.attribution.creator}
            </a>{' '}
            on{' '}
            <a
              className="hover:text-slate-300"
              href={selected.attribution.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selected.attribution.sourceName}
            </a>{' '}
            ·{' '}
            <a
              className="hover:text-slate-300"
              href={selected.attribution.licenseUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selected.attribution.licenseName ?? 'License'}
            </a>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
