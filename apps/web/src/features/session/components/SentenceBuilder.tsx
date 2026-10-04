export function SentenceBuilder({
  tiles,
  selected,
  onChange,
  disabled,
  language,
}: {
  tiles: { id: string; text: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  language: string;
}) {
  return (
    <div className="sentence-builder">
      <div
        className="sentence-line"
        role="group"
        aria-label="Your phrase"
        lang={language}
        dir="auto"
      >
        {selected.map((id) => {
          const tile = tiles.find((item) => item.id === id)!;
          return (
            <button
              key={id}
              type="button"
              className="sentence-tile"
              disabled={disabled}
              aria-label={`Remove ${tile.text}`}
              onClick={() => onChange(selected.filter((value) => value !== id))}
            >
              {tile.text}
            </button>
          );
        })}
      </div>
      <div
        className="sentence-pool"
        role="group"
        aria-label="Available words"
        lang={language}
        dir="auto"
      >
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className="sentence-tile"
            disabled={disabled || selected.includes(tile.id)}
            aria-label={`Add ${tile.text}`}
            onClick={() => onChange([...selected, tile.id])}
          >
            {tile.text}
          </button>
        ))}
      </div>
    </div>
  );
}
