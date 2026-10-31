---
name: unstuck-interface
description: Guides the design, layout, styling, and interaction architecture of Unstuck's desktop coach UI, transparent overlay, and state transitions according to Akash and ChatGPT's design specifications.
---

# Unstuck Interface Skill

## Overview
This skill guides the implementation of Unstuck's UI components, styling system, and interactive states. Unstuck delivers guidance as a non-intrusive, cinematic, layered desktop coach operating alongside real third-party applications.

## Design Ownership & Process
- **Design Authority:** Akash and ChatGPT own all visual decisions: color palettes, typography, spacing tokens, animations, window framing, and micro-interactions.
- **Role of Builder:** Antigravity implements specifications faithfully, reports layout constraints, verifies scaling fidelity, and proposes ergonomic improvements without altering approved design decisions.
- **Quality Target:** Cinematic, layered, premium interface with high contrast, legible hierarchy, and smooth status transitions.

## Surfaces and Core States
Unstuck comprises two synchronized Electron windows:
1. **Coach Window:** A small, movable, highly legible controller panel providing current instructions, goal context, and session controls.
2. **Overlay Window:** A transparent, fullscreen click-through window displaying grounded bounding brackets/highlights around target software controls.

### Required State Behaviors
1. **Start / Welcome State:**
   - Clearly explains the supported task and active monitor.
   - Accepts or confirms the user's current goal (e.g., creating a horizontal bar chart).
   - Informs the user that checking transmits screen snapshots to Gemini.
2. **Persistent Controller State:**
   - Displays the current single actionable instruction with clear step context.
   - Interactive buttons: `Check` (primary), `Pause`, `Stop`.
   - Displays keyboard shortcut hints (e.g. `Ctrl+Shift+C`).
   - Compact footprint that avoids obscuring key software areas.
3. **Target Guidance State:**
   - Draws a precise highlight (e.g. corner brackets or glowing focus outline) at the model-grounded coordinate.
   - Forwards mouse events completely (`click-through`) to allow uninterrupted user interaction with the application.
   - Clears cleanly whenever a new check is initiated or the session stops.
4. **Recovery State:**
   - Visually indicates an observed mistake (e.g., wrong menu opened, pie chart selected instead of bar chart).
   - Explains the observed deviation concisely and provides the exact corrective step while keeping the original goal active.
5. **Uncertain / Error State:**
   - If the model is uncertain, presents a non-punitive notice asking the user to bring the target window into view or open the relevant menu.
   - Never draws guessed or default highlights.
   - Handles network timeouts or HTTP 429 quota pauses gracefully with clear retry affordances.
6. **Completion State:**
   - Displays verified evidence of task completion (e.g., chart visible with required title).
   - Offers clean session conclusion and reset.

## Ergonomics & Verification Checklist
- [ ] Text remains crisp and legible under Windows 125% DPI display scaling.
- [ ] The coach window is movable and does not collide with the target application's main controls.
- [ ] Keyboard navigation is fully supported for core controls (`Check`, `Stop`).
- [ ] Motion respects reduced-motion settings where applicable.
- [ ] Status is never communicated by color alone (always include clear icons and textual copy).
