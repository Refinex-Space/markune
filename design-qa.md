**Comparison Target**

- Source visual truth: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-22143cf5-ef27-41f0-a81c-477a7891f507.png`
- Rendered implementation: `/tmp/madora-cargo-skill-menu-final3.png`
- Focused implementation crop: `/tmp/madora-skill-crop-final3.png`
- Combined comparison evidence: `/tmp/madora-skill-design-qa-comparison-final.png`
- Viewport: source `1576 × 914`; Madora window capture `5344 × 2926` Retina pixels. The focused implementation crop was normalized to the source component state rather than treating the fixed Madora side panel as a full-width ChatGPT composer.
- State: light theme, AI panel expanded, `/` entered in an empty composer, installed Skills loaded, first row selected.

**Full-view Comparison Evidence**

- The Skill panel is anchored immediately above the composer and does not cover the input.
- The panel follows the available Madora AI-sidebar width while preserving the source hierarchy: `技能` heading, selected row, Skill name, description, source label, thin internal scrollbar, then the composer.
- The fixed sidebar is intentionally narrower than the source ChatGPT conversation layout; this is a product-shell constraint, not an actionable component mismatch.

**Focused Region Comparison Evidence**

- `/tmp/madora-skill-design-qa-comparison-final.png` places the reference and normalized implementation crop in the same image.
- Fonts and typography: the same Madora UI font token is used for the panel and atomic mentions; weights, truncation, hierarchy, and muted descriptions match the existing product shell. The source uses ChatGPT's system sans stack, while Madora intentionally preserves its configurable UI font.
- Spacing and layout rhythm: compact row height, full-width selected state, consistent horizontal alignment, rounded frame, and the six-pixel menu-to-composer gap remain readable in the narrower sidebar.
- Colors and visual tokens: background, border, selected-row fill, foreground, muted copy, and focus colors use existing Madora theme tokens and retain light-theme contrast.
- Image and icon fidelity: Skills use the same Lucide cube icon throughout; file and plugin mentions use their own asset sources. No emoji, CSS-drawn icon, or placeholder box is used.
- Copy and content: friendly `Chrome: Control Chrome` and `Computer Use: Computer Use` fallbacks replace raw canonical names; descriptions and `个人` source labels come from App Server metadata.

**Findings**

- No remaining actionable P0, P1, or P2 mismatch.

**Comparison History**

1. Initial evidence: `/tmp/madora-cargo-skill-menu-live.png`
   - [P2] The implementation exposed an extra close button absent from the source.
   - [P2] Skills without `interface.displayName` displayed raw canonical names such as `chrome:control-chrome`.
   - Fixes: removed the close control, retained Escape dismissal, added readable canonical-name formatting, and replaced `scrollIntoView` with list-local `scrollTop` adjustment.
2. Post-fix evidence: `/tmp/madora-cargo-skill-menu-final3.png` and `/tmp/madora-skill-design-qa-comparison-final.png`
   - The extra close control is gone.
   - Canonical names render as readable labels.
   - The panel remains above the composer and its scrollbar stays inside the Skill list.

**Primary Interactions Tested**

- Entering `/` opens the Skill list.
- Entering `/Design` filters the list and selecting `Design QA` inserts an atomic cube-icon mention.
- Entering `@README` and selecting the result inserts an atomic file-icon mention.
- Focused automated tests cover Skill keyboard selection, native Skill input generation, plugin icon insertion, mention deletion, and history restoration.
- The desktop development terminal showed no frontend runtime exception during these interactions; only existing macOS input-method diagnostics were emitted.

**Open Questions**

- None.

**Implementation Checklist**

- [x] Skill panel opens from `/`.
- [x] Skill list uses friendly names, descriptions, source labels, selected state, and a thin local scrollbar.
- [x] File, plugin, and Skill mentions render distinct icons.
- [x] Explicit Skills send both `$canonical-name` text and native `type: "skill"` input.
- [x] Reference and implementation were compared in one normalized image.

**Follow-up Polish**

- None required for this scope.

final result: passed
