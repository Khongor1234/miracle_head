import Markdown from 'react-markdown';

// Counselor replies may carry light Markdown (*emphasis*, **bold**, lists).
// Render only those; anything else is unwrapped to its text. Raw HTML is
// never rendered (react-markdown's default).
const ALLOWED_ELEMENTS = ['p', 'em', 'strong', 'ul', 'ol', 'li', 'br'];

// Single newlines in model output are meant as line breaks.
const keepLineBreaks = (text) => String(text || '').replace(/\n/g, '  \n');

export default function ReplyText({ text }) {
  return (
    <div className="bubble-text bubble-markdown">
      <Markdown allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed>
        {keepLineBreaks(text)}
      </Markdown>
    </div>
  );
}
