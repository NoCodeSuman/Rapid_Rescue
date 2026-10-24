let seq = 0;
/** Unique id for demo entities (prefix + time + counter + random). */
export function newId(prefix: string): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${rand}`;
}
