---
name: unstuck-screen-guidance
description: Guides screen capture execution, monitor coordinate mapping under DPI scaling, Gemini prompt structuring, response validation, and mistake recovery workflows for Unstuck.
---

# Unstuck Screen Guidance Skill

## Overview
This skill governs the desktop screen capture loop, coordinate normalization and transformation, Gemini multimodal prompt/schema contracts, and resilient mistake recovery handling.

## Desktop Capture Protocol
To ensure target visibility without capturing Unstuck's own interface:
1. When `Check` or `Start` is triggered:
   - Temporarily hide or minimize the Coach Panel and Overlay Window.
   - Insert a short pause (e.g., 80–120ms) allowing the Windows DWM / desktop to redraw cleanly.
   - Capture the active primary display using Electron `desktopCapturer`.
   - Restore the Coach Panel to its interactive state.
2. Maintain raw captured image bytes in memory (JPEG/PNG buffer); avoid writing unneeded screenshot files to disk.

## Coordinate Normalization & DPI Geometry
The target machine uses Windows 11 with 125% DPI display scaling (Physical: `2560x1600`, Logical bounds: `2048x1280`, DPI: 120).

### Transformation Rules:
1. **Gemini Coordinate Convention:**
   - Gemini models return normalized coordinates: `[ymin, xmin, ymax, xmax]`, where values range from `0` to `1000`.
2. **Overlay Screen Mapping:**
   - Physical captured dimensions: $W_{cap}$, $H_{cap}$.
   - Primary monitor logical bounds: $(X_{mon}, Y_{mon}, W_{mon}, H_{mon})$.
   - Overlay logical coordinates:
     $$x = X_{mon} + \left(\frac{xmin}{1000}\right) \times W_{mon}$$
     $$y = Y_{mon} + \left(\frac{ymin}{1000}\right) \times H_{mon}$$
     $$width = \left(\frac{xmax - xmin}{1000}\right) \times W_{mon}$$
     $$height = \left(\frac{ymax - ymin}{1000}\right) \times H_{mon}$$
3. **Validation Guards:**
   - Require $ymin < ymax$ and $xmin < xmax$.
   - Reject null, non-numeric, NaN, or out-of-range ($<0$ or $>1000$) values.
   - If invalid or null, treat target box as absent (do not draw guessed box).

## Model Request & Schema Contract
Each check sends:
- Current full monitor screenshot.
- Goal description.
- Last instruction issued and expected visible outcome.
- Compact observation history.

### Structured Response Schema:
```json
{
  "assessment": "not_started | expected | unexpected | uncertain",
  "status": "guide | recover | uncertain | complete",
  "observation": "Concise factual description of current screen state.",
  "instruction": "One single immediate action for the user.",
  "targetLabel": "Readable label of the control to click or select.",
  "targetBox": [ymin, xmin, ymax, xmax],
  "expectedOutcome": "What will appear after the user executes this action.",
  "reason": "Brief rationale for why this step is next."
}
```

## Recovery & Verification Guidelines
- **No False Progress:** User pressing `Check` does not advance the state. Progress advances only if `assessment == "expected"` based on visual evidence.
- **LibreOffice Calc Benchmark Cases:**
  1. *Wrong Menu Recovery:* User clicks `Format` instead of `Insert`. Model identifies unexpected menu and instructs: *"Click 'Insert' on the top menu bar."*
  2. *Wrong Chart Type Recovery:* User selects `Pie` instead of `Bar`. Model observes the dialog is in Pie mode and instructs: *"Select 'Bar' from the chart type list."*
- **Uncertainty Fallback:** When controls are obscured or dialogs closed prematurely, state becomes `uncertain`, asking the user to bring the application forward.
