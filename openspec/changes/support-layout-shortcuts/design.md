# Design: Support Layout Shortcuts

## space-around Implementation

In flex.ts justify logic, after `space-between` case:
```ts
} else if (justifyContent === 'space-around') {
  const spacePerItem = line.items.length > 0 ? freeSpace / line.items.length : 0
  mainOffset += spacePerItem / 2
  for (const item of line.items) {
    // place item at mainOffset
    mainOffset += axis.main(item.size) + gap + spacePerItem
  }
  continue
}
```

## baseline Implementation

In `getCrossOffset`, treat baseline as center (CSS spec: baseline requires font metrics, center is the correct approximation):
```ts
if (alignItems === 'center' || alignItems === 'baseline') {
  return padding + (crossSize - childCross) / 2
}
```

## VALID_* Arrays

Exported from `src/core/types.ts` as `as const` arrays, imported in `src/syntax/h.ts` for validation.
This prevents drift between the shortcut type and the core type.
