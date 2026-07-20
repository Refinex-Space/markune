---
name: madora-diagram
description: Create editable Madora technical diagrams from natural-language requests using Mermaid preview and Madora drawing tools. Use for architecture diagrams, flowcharts, sequence diagrams, class diagrams, ER diagrams, state diagrams, and Chinese requests such as 画图、架构图、流程图、时序图.
---

# Madora Diagram

Turn the user's intent into a concise Mermaid definition, preview it with Madora, inspect the rendered result, and create the exact approved preview as an editable Drawing.

## Workflow

1. Choose exactly one supported Mermaid diagram type: `flowchart`/`graph`, `sequenceDiagram`, `classDiagram`, `erDiagram`, or `stateDiagram-v2`.
2. Preserve the user's language. Keep labels short, concrete, and domain-specific.
3. For a complex architecture, read [diagram-style.md](references/diagram-style.md) before writing Mermaid.
4. Call `madora_drawing.preview_mermaid` with only `title` and `definition`.
5. Inspect the returned preview image and warnings for clipping, overlap, ambiguous direction, unreadable labels, and excessive density.
6. If needed, revise the Mermaid and preview again. Make at most two repair attempts after the first preview.
7. Call `madora_drawing.create_from_preview` with the final `previewId`. Never recreate or substitute the definition during creation.
8. Tell the user which editable Drawing was created. If a valid result is not possible within two repairs, report the remaining visual problem instead of creating a poor drawing.

## Safety

- Use only the `madora_drawing` tools for AI drawing.
- Never read or write `.madora/drawings` directly.
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
