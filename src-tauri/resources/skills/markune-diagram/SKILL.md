---
name: markune-diagram
description: Create, inspect, and update the active editable Markune Excalidraw technical diagram through validated Mermaid previews. Use for architecture diagrams, flowcharts, sequence diagrams, class diagrams, ER diagrams, state diagrams, and requests such as 技术图、架构图、流程图、时序图. Do not use for 脑图、思维导图、知识结构 or hierarchical outlines; use markune-mindmap instead.
---

# Markune Diagram

Inspect relevant Drawings when present. Reduce the request to one clear viewpoint, generate concise Mermaid, and apply or create only a grade-A preview.

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
10. When `quality.creatable` is `true`, `quality.grade` is `A`, and the image is visually coherent, use the returned `previewId` unchanged:
   - If a `whiteboard` is active and the user asks to change, redraw, improve, or replace the current diagram, call `markune_drawing.apply_preview_to_active`.
   - If no Drawing is active, or the user explicitly asks for a new diagram or copy, call `markune_drawing.create_from_preview`.
   - If the active Drawing is a `mindmap`, do not overwrite it with an Excalidraw preview. Create a new technical diagram only when that matches the request.
11. If the third preview is still blocked, report the remaining quality findings and stop. Never apply or create a known-poor diagram.

## Safety

- Use only `markune_drawing` tools for AI drawing.
- Inspect only Drawing IDs present in the current turn context. Never guess from history.
- Never read or write `.markune/drawings` directly.
- Modify only the turn-bound active `whiteboard`, and only through `apply_preview_to_active`. Explicitly mentioned Drawings remain read-only.
- Never substitute an import file for Markune tools.
- Do not use Mermaid initialization directives, HTML, links, images, scripts, click handlers, or embeddables.
- Do not request or invent a physical storage path or album path.

## Non-negotiable quality rules

- One diagram answers one question at one abstraction level.
- Never model shared platform capabilities as per-service full-mesh relationships in an overview.
- Use no literal `\n` in labels. Shorten the label instead.
- Use at most two meaningful edge styles. Solid is the primary flow; dashed is asynchronous, control, or observational.
- Do not apply or create a Drawing from a preview with crossings, edges through unrelated nodes, clipped labels, excessive fan-out, or invalid bindings.
- Prefer omission and a second focused diagram over squeezing the entire system story into one canvas.
