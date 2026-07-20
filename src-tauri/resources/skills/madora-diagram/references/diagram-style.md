# Technical diagram style

## Structure

- Put clients and external actors at the start of the flow.
- Put gateways, orchestration, and shared platform services in the middle.
- Put data stores and external dependencies at the end or bottom.
- Use one visual hierarchy: title, layer/group, node, edge label.
- If a label needs more than two short lines, shorten it or move the detail into an edge label.

## Direction

- Use `flowchart LR` for request paths, pipelines, and compact processes.
- Use `flowchart TB` for layered architectures and diagrams with three or more tiers.
- Keep the main path monotonic. Use dotted edges only for optional, asynchronous, or observational relationships.

## Semantic color intent

Madora applies the final Excalidraw theme. Optional Mermaid `classDef` rules may express semantic fill and stroke colors only; never use them for URLs, images, HTML, or layout tricks:

- entry and user-facing nodes: blue
- application and compute nodes: violet
- data and durable state: green
- messaging and asynchronous infrastructure: amber
- external systems and risk boundaries: slate or red only when genuinely risky

Do not assign a unique color to every node. A diagram should normally use no more than four semantic colors.

## Review checklist

- Every node has a non-empty, specific label.
- The primary direction is obvious without reading every edge.
- Groups do not overlap and labels are not clipped.
- The preview remains readable at panel width.
- Arrows terminate on their intended nodes and bidirectional relations are intentional.
