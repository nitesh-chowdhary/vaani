import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConceptMedia } from '@vaani/learning-core';
import { mediaProvider } from '../services/media-provider';
import { LearningIcon } from './LearningIcon';

export function ConceptMediaView({
  media,
  hideMeaning = false,
  eager = false,
  selection,
  fallbackLabel,
}: {
  media: ConceptMedia;
  hideMeaning?: boolean;
  eager?: boolean;
  fallbackLabel?: string;
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
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
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
          setResolving(false);
          clearTimeout(timeout);
        });
    }
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [stableMedia, retry]);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);

  const frame = (
    <>
      <img
        key={retry}
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
        onError={() => {
          if (src !== media.fallback) {
            setSrc(media.fallback);
            setFailed(true);
          } else {
            setLoadedSrc(src);
            setFailed(true);
          }
        }}
      />
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
          disabled={selection.disabled}
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
      {failed ? (
        <p role="status" className="photo-status">
          {fallbackLabel ?? 'Photograph unavailable.'}
          <button
            type="button"
            className="photo-retry"
            aria-label="Retry photograph"
            onClick={() => {
              setLoadedSrc(undefined);
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </p>
      ) : selected.attribution ? (
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
