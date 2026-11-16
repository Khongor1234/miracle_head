// Asset paths for the five emotion agents (art made with Higgsfield).
export const AGENT_ORDER = ['Joy', 'Sadness', 'Anger', 'Fear', 'Disgust'];

const slug = (character) => String(character || '').toLowerCase();

export const agentAvatar = (character) => `/characters/avatars/${slug(character)}.webp`;
export const agentFrame = (character) => `/characters/frames/${slug(character)}.webp`;
export const agentLoop = (character) => `/characters/loops/${slug(character)}.mp4`;

// Index into the translated `characters` list (same order as AGENT_ORDER).
export const agentIndex = (character) => AGENT_ORDER.indexOf(character);
