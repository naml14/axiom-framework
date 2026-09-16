# Spec: Unify Text Measurement

## Requirements

### R1: Single source of truth
A shared `measureTextChild` function exists at `src/render/engines/text-measure.ts`.
No engine defines its own inline text-measurement logic.

### R2: Consistent parameters
`charWidth=8`, `wordWrapFactor=1.4` used everywhere.

### R3: Behavioral parity
All engines produce identical height for the same text + width + lineHeight inputs.

## Scenarios

### S1: Basic measurement
Given text="Hello" (5 chars), width=500, lineHeight=20
→ charsPerLine=62, lineCount=1, height=20

### S2: Word-wrap factor applied
Given text="Hello World" (11 chars), width=30, lineHeight=20
→ charsPerLine=3, lineCount=ceil(11/3*1.4)=ceil(5.13)=6, height=120

### S3: All engines produce same result
fast-path, flex, grid, and reflow all produce height=120 for S2 inputs.
