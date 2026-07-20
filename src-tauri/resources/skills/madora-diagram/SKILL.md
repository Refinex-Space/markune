---
name: madora-diagram
description: Inspect active or explicitly mentioned Madora Drawings and create editable technical diagrams through Mermaid preview and Madora drawing tools. Use for understanding or improving the current drawing, comparing mentioned drawings, architecture diagrams, flowcharts, sequence diagrams, class diagrams, ER diagrams, state diagrams, and Chinese requests such as 当前图、分析这张图、画图、架构图、流程图、时序图.
---

# Madora Diagram

Inspect relevant Madora Drawings when present. For creation requests, turn the user's intent into concise Mermaid, inspect the rendered preview, and create the exact approved result as a new editable Drawing.

## Workflow

1. Check `madora_active_drawing` and `madora_explicit_drawing_references`. When the request depends on any listed Drawing, call `madora_drawing.inspect_drawing` with its exact `drawingId` before making claims about nodes, edges, groups, or layout.
2. For an analysis-only request, answer from the inspection result and stop. Do not create a replacement unless the user asks for one.
3. For a creation or improvement request, choose exactly one supported Mermaid diagram type: `flowchart`/`graph`, `sequenceDiagram`, `classDiagram`, `erDiagram`, or `stateDiagram-v2`.
4. Preserve the user's language. Keep labels short, concrete, and domain-specific. When improving an inspected Drawing, retain correct domain terms and relationships while reducing avoidable crossings and density.
5. For a complex architecture, read [diagram-style.md](references/diagram-style.md) before writing Mermaid.
6. Call `madora_drawing.preview_mermaid` with only `title` and `definition`.
7. Inspect the returned preview image and warnings for clipping, overlap, ambiguous direction, unreadable labels, and excessive density.
8. If needed, revise the Mermaid and preview again. Make at most two repair attempts after the first preview.
9. Call `madora_drawing.create_from_preview` with the final `previewId`. Never recreate or substitute the definition during creation.
10. Tell the user which new editable Drawing was created. If a valid result is not possible within two repairs, report the remaining visual problem instead of creating a poor drawing.

## Safety

- Use only the `madora_drawing` tools for AI drawing.
- Inspect only Drawing IDs present in the current turn context. Never guess an ID from history.
- Never read or write `.madora/drawings` directly.
- Never claim that the current Drawing was modified; v1 creates a new Drawing rather than patching or overwriting the source.
- Never generate a file for the user to import as a substitute for the Madora tools.
- Do not use Mermaid initialization directives, HTML, links, images, scripts, click handlers, or embeddables.
- Do not request or invent a physical storage path or album path.

## Layout Rules

- Use `LR` for a small linear process or request path. Use `TB` for a multi-layer system architecture.
- Use subgraphs only for meaningful layers, trust boundaries, teams, or deployment zones.
- Use short ASCII node and subgraph IDs. Put Chinese or other localized text only in quoted labels.
- Prefer 5–12 primary nodes. Split dense detail into grouped secondary nodes rather than long prose.
- Make edge labels describe protocols or events only when they add information.
- Avoid crossed edges, backward flow, unlabeled placeholder nodes, and decorative emoji.
