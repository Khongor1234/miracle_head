import { useState } from 'react';

const CLAMP_CHARACTERS = 180;

// Under the selected answer: the winning agent's own first-round reading of
// why the visitor wrote what they wrote, which its reply was built on.
export default function WinnerReason({ text, labels }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const reason = String(text || '').trim();
  if (!reason) return null;
  const isLong = reason.length > CLAMP_CHARACTERS;

  return (
    <div className="winner-why">
      <span className="winner-why-title">{labels.title}</span>
      <p className={`winner-why-text${isLong && !isExpanded ? ' is-clamped' : ''}`}>{reason}</p>
      {isLong && (
        <button type="button" className="winner-why-more" aria-expanded={isExpanded} onClick={() => setIsExpanded((open) => !open)}>
          {isExpanded ? labels.less : labels.more}
        </button>
      )}
    </div>
  );
}
