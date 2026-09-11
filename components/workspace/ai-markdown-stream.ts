/** Hold incomplete paragraphs, tables and fences in a cheap text tail. author: refinex */
export function splitAiMarkdownStream(markdown: string) {
  let fence: { character: string; length: number } | null = null;
  let stable = 0;
  let offset = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
    if (match) {
      if (!fence) fence = { character: match[1][0], length: match[1].length };
      else if (
        match[1][0] === fence.character &&
        match[1].length >= fence.length &&
        !match[2].trim()
      )
        fence = null;
    }
    offset += line.length;
    if (!fence && /^\s*\n$/.test(line)) stable = offset;
  }
  return { stable: markdown.slice(0, stable), tail: markdown.slice(stable) };
}
