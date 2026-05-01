import { expectTypeOf } from 'expect-type'
import { Fragment, jsx, jsxs } from '../../src/jsx-runtime.js'
import { Fragment as DevFragment, jsx as devJsx, jsxs as devJsxs, jsxDEV } from '../../src/jsx-dev-runtime.js'
import type { ComponentNode, FragmentNode } from '../../src/core/types.js'

expectTypeOf(jsx('div', { id: 'root' })).toExtend<ComponentNode>()
expectTypeOf(jsxs('div', { children: ['a', 'b'] })).toExtend<ComponentNode>()
expectTypeOf(Fragment('a', 'b')).toEqualTypeOf<FragmentNode>()

expectTypeOf(devJsx('div', { id: 'root' })).toExtend<ComponentNode>()
expectTypeOf(devJsxs('div', { children: ['a', 'b'] })).toExtend<ComponentNode>()
expectTypeOf(DevFragment('a', 'b')).toEqualTypeOf<FragmentNode>()
expectTypeOf(jsxDEV('div', { id: 'root' }, 'key')).toExtend<ComponentNode>()
