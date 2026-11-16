import { useEffect, useId, useRef, useState } from 'react';

const MODEL_OPTIONS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'recommended' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', tag: 'fast' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', tag: 'new' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: 'fast' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', tag: 'preview' },
];

// A pill that opens a listbox of models: arrow keys move, Enter picks,
// Escape or a click outside closes and returns focus to the pill.
export default function ModelPicker({ value, labels, disabled, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const selectedIndex = Math.max(0, MODEL_OPTIONS.findIndex((option) => option.id === value));
  const selected = MODEL_OPTIONS.find((option) => option.id === value);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    listRef.current?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const open = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const choose = (index) => {
    onChange(MODEL_OPTIONS[index].id);
    close();
  };

  const onListKeyDown = (event) => {
    const last = MODEL_OPTIONS.length - 1;
    const moves = {
      ArrowDown: () => setActiveIndex((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActiveIndex((i) => Math.max(0, i - 1)),
      Home: () => setActiveIndex(0),
      End: () => setActiveIndex(last),
      Enter: () => choose(activeIndex),
      ' ': () => choose(activeIndex),
      Escape: close,
      Tab: () => setIsOpen(false),
    };
    const move = moves[event.key];
    if (!move) return;
    if (event.key !== 'Tab') event.preventDefault();
    move();
  };

  const onButtonKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  };

  return (
    <div className={`model-picker${isOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="model-picker-button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label={`${labels.label}: ${selected?.name ?? value}`}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="model-picker-spark" aria-hidden="true" />
        <span className="model-picker-text">
          <span className="model-picker-label">{labels.label}</span>
          <span className="model-picker-value">{selected?.name ?? value}</span>
        </span>
        <span className="model-picker-chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          id={listId}
          className="model-picker-menu"
          role="listbox"
          tabIndex={-1}
          aria-label={labels.label}
          aria-activedescendant={`${listId}-${activeIndex}`}
          onKeyDown={onListKeyDown}
        >
          {MODEL_OPTIONS.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.id === value}
              className={`model-option${index === activeIndex ? ' is-active' : ''}${option.id === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="model-option-main">
                <span className="model-option-name">{option.name}</span>
                <span className="model-option-note">{labels.notes[option.tag]}</span>
              </span>
              <span className={`model-option-tag tag-${option.tag}`}>{labels.tags[option.tag]}</span>
              <span className="model-option-check" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
