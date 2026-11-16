/**
 * Agent instructions ("personas") follow the interface language: the server
 * ships each default in Japanese (`persona`) and English (`persona_en`).
 * A persona the visitor has edited is theirs and is never swapped.
 */

export const personaFor = (agent, lang) => (lang === 'en' && agent.persona_en ? agent.persona_en : agent.persona);

export const localizeDefaults = (defaults, lang) => defaults.map((agent) => ({ ...agent, persona: personaFor(agent, lang) }));

/** Swaps every persona that is still a stock default, in either language, to the default for `lang`. */
export function localizeAgents(agents, defaults, lang) {
  return agents.map((agent) => {
    const stock = defaults.find((item) => item.character === agent.character);
    if (!stock) return { ...agent };
    const isStock = [stock.persona, stock.persona_en].filter(Boolean).includes(agent.persona);
    return isStock ? { ...agent, persona: personaFor(stock, lang) } : { ...agent };
  });
}

/** The fields the backend accepts for an agent. */
export const toRequestAgents = (agents) => agents.map(({ character, name, persona }) => ({ character, name, persona }));
