---
name: markune-diagram
description: Inspect active or explicitly mentioned Markune Drawings and create rigorous, professional, editable technical diagrams through Mermaid preview and Markune drawing tools. Use for understanding or improving the current drawing, comparing mentioned drawings, architecture diagrams, flowcharts, sequence diagrams, class diagrams, ER diagrams, state diagrams, and Chinese requests such as 当前图、分析这张图、画图、架构图、流程图、时序图.
---

# Markune Diagram

Inspect relevant Drawings when present. For creation, reduce the request to one clear viewpoint, generate concise Mermaid, and create only a grade-A preview.

## Workflow

1. Check `markune_active_drawing` and `markune_explicit_drawing_references`. When the request depends on a listed Drawing, call `markune_drawing.inspect_drawing` with its exact `drawingId` before making claims about its content or layout.
2. For analysis only, answer from the inspection and stop. If the user refers to a current diagram but no Drawing reference or source artifact is available, request the missing diagram instead of inventing a replacement.
3. Before writing Mermaid, determine the audience, the single question the diagram answers, one abstraction level, the primary reading path, required facts, and deliberately omitted detail.
4. Choose one supported type and profile:
   - system or software architecture: `flowchart` with `profile: "architecture"`
   - process, pipeline, or request path: `flowchart` with `profile: "flow"`
   - sequence, class, ER, or state diagram: the matching Mermaid type with `profile: "default"`
5. For every flowchart, read [diagram-style.md](references/diagram-style.md) and obey its budgets and aggregation patterns.
6. Preserve the user's language. Use short, concrete domain labels. Keep one monotonic main direction and express only relationships needed for the chosen viewpoint.
7. Call `markune_drawing.preview_mermaid` with exactly `title`, `definition`, and `profile`.
8. Inspect both the preview image and `quality`. Treat `quality.blockers` as mandatory repairs and `quality.suggestions` as the repair plan. Also check clipping, hierarchy, whitespace, and semantic accuracy visually.
9. Revise and preview at most twice after the first attempt. Reduce or aggregate content before trying cosmetic Mermaid changes.
10. Call `markune_drawing.create_from_preview` only when `quality.creatable` is `true`, `quality.grade` is `A`, and the image is visually coherent. Creation must use the returned `previewId` unchanged.
11. If the third preview is still blocked, report the remaining quality findings and stop. Never create a known-poor diagram.

## Safety

- Use only `markune_drawing` tools for AI drawing.
- Inspect only Drawing IDs present in the current turn context. Never guess from history.
- Never read or write `.markune/drawings` directly.
- Never claim the current Drawing was modified; this workflow creates a new Drawing.
- Never substitute an import file for Markune tools.
- Do not use Mermaid initialization directives, HTML, links, images, scripts, click handlers, or embeddables.
- Do not request or invent a physical storage path or album path.

## Non-negotiable quality rules

- One diagram answers one question at one abstraction level.
- Never model shared platform capabilities as per-service full-mesh relationships in an overview.
- Use no literal `\n` in labels. Shorten the label instead.
- Use at most two meaningful edge styles. Solid is the primary flow; dashed is asynchronous, control, or observational.
- Do not create a Drawing from a preview with crossings, edges through unrelated nodes, clipped labels, excessive fan-out, or invalid bindings.
- Prefer omission and a second focused diagram over squeezing the entire system story into one canvas.
