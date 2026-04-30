import { expectTypeOf } from 'expect-type'
import { signal } from '../../src/reactivity/signals.js'
import {
  maxLength,
  minLength,
  pattern,
  required,
  validate,
  type AsyncRule,
  type SyncRule,
  type ValidationResult,
  type ValidationRule,
} from '../../src/features/forms.js'
import type { Signal } from '../../src/core/types.js'

expectTypeOf(required).toEqualTypeOf<SyncRule<string>>()
expectTypeOf(minLength(3)).toEqualTypeOf<SyncRule<string>>()
expectTypeOf(maxLength(12)).toEqualTypeOf<SyncRule<string>>()
expectTypeOf(pattern(/a/)).toEqualTypeOf<SyncRule<string>>()

const syncRule: SyncRule<string> = { type: 'sync', validate: (value) => value ? null : 'empty' }
const asyncRule: AsyncRule<string> = { type: 'async', validate: async (value) => value ? null : 'empty' }
expectTypeOf(syncRule).toExtend<ValidationRule<string>>()
expectTypeOf(asyncRule).toExtend<ValidationRule<string>>()

const result = validate(signal('value'), [required, syncRule, asyncRule], { debounceMs: 0 })
expectTypeOf(result).toEqualTypeOf<Signal<ValidationResult> & { dispose: () => void }>()
expectTypeOf(result.dispose).toEqualTypeOf<() => void>()

const numberRule: SyncRule<number> = { type: 'sync', validate: (value) => value > 0 ? null : 'positive' }
validate(signal(1), [numberRule])
// @ts-expect-error validation rules must match the source signal value type
validate(signal(1), [required])
