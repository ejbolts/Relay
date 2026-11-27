import { useRef, useState } from 'react';
import { EMOJI_GROUPS } from './emojiCatalog';
import { searchEmojis, type EmojiEntry } from './emojiPicker';
import { reactionChoice, reactionKey } from './friendFeedData';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import type { WorkoutReactionKind } from './types';
import './emojiReactionSheet.css';

/**
 * Any emoji as a reaction, to a workout or a comment: search by name, jump between categories,
 * or type an emoji from the keyboard into the search. Choosing your current reaction again, or
 * Remove, takes it away.
 */
export default function EmojiReactionSheet({
  title,
  yours,
  busy = false,
  error,
  onChoose,
  onClose,
}: {
  title: string;
  yours: WorkoutReactionKind | null;
  busy?: boolean;
  error?: string | null;
  /** The chosen reaction's saved key; `null` removes yours. */
  onChoose: (reaction: WorkoutReactionKind | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<Array<HTMLElement | null>>([]);
  const searching = query.trim().length > 0;
  const results = searching ? searchEmojis(query) : [];
  const current = reactionChoice(yours);

  function choose(emoji: string) {
    const key = reactionKey(emoji);
    onChoose(key === yours ? null : key);
  }

  function emojiButton([emoji, name]: EmojiEntry) {
    const key = reactionKey(emoji);
    return (
      <button
        key={emoji}
        type="button"
        aria-label={name}
        title={name}
        aria-pressed={key === yours}
        disabled={busy}
        onClick={() => choose(emoji)}
      >
        {emoji}
      </button>
    );
  }

  function showGroup(index: number) {
    setGroup(index);
    const section = sections.current[index];
    if (section && scroller.current) scroller.current.scrollTop = section.offsetTop;
  }

  function followScroll() {
    const top = (scroller.current?.scrollTop ?? 0) + 8;
    let index = 0;
    sections.current.forEach((section, position) => {
      if (section && section.offsetTop <= top) index = position;
    });
    setGroup(index);
  }

  return (
    <PopupDialog
      variant="sheet"
      size="tall"
      title={title}
      className="emoji-reaction-sheet"
      onClose={onClose}
      actions={
        current && (
          <button
            type="button"
            className="emoji-reaction-remove"
            disabled={busy}
            onClick={() => onChoose(null)}
          >
            <span aria-hidden="true">{current.emoji}</span> Remove reaction
          </button>
        )
      }
    >
      <div className="emoji-reaction-body" aria-busy={busy}>
        <label className="emoji-reaction-search">
          <Icon name="search" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search emoji"
            placeholder="Search emoji"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </label>
        {!searching && (
          <div className="emoji-reaction-tabs" role="group" aria-label="Emoji categories">
            {EMOJI_GROUPS.map((item, index) => (
              <button
                key={item.name}
                type="button"
                aria-label={item.name}
                title={item.name}
                aria-current={index === group ? 'true' : undefined}
                onClick={() => showGroup(index)}
              >
                {item.icon}
              </button>
            ))}
          </div>
        )}
        <div ref={scroller} className="emoji-reaction-scroll" onScroll={followScroll}>
          {searching ? (
            results.length ? (
              <div className="emoji-reaction-grid" role="group" aria-label="Search results">
                {results.map(emojiButton)}
              </div>
            ) : (
              <p className="emoji-reaction-empty" role="status">
                No emoji found
              </p>
            )
          ) : (
            EMOJI_GROUPS.map((item, index) => (
              <section
                key={item.name}
                ref={(element) => {
                  sections.current[index] = element;
                }}
                aria-label={item.name}
              >
                <h3>{item.name}</h3>
                <div className="emoji-reaction-grid">{item.emojis.map(emojiButton)}</div>
              </section>
            ))
          )}
        </div>
        {error && (
          <p className="inline-error emoji-reaction-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </PopupDialog>
  );
}
