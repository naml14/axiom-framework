import { defineComponent } from '../src/index.ts'
import { getTagWidth } from './layout.js'

export const TagBubble = defineComponent((props: { label: string; color: string }) => {
  const calcWidth = getTagWidth(props.label)

  return {
    type: 'element' as const,
    tag: 'span',
    layout: { width: calcWidth, height: 20 },
    classes: ['tag-bubble', `tag-${props.color}`],
    children: [{ type: 'text' as const, content: props.label }],
  }
})

export const Card = defineComponent((props: {
  title: string
  body: string
  colorClass: string
}) => ({
  type: 'element' as const,
  tag: 'article',
  layout: { flexDirection: 'column', gap: 5, padding: 10 },
  classes: ['card', props.colorClass],
  children: [
    {
      type: 'element' as const,
      tag: 'h3',
      classes: ['card-title'],
      children: [{ type: 'text' as const, content: props.title }],
    },
    {
      type: 'element' as const,
      tag: 'p',
      classes: ['card-body'],
      children: [{ type: 'text' as const, content: props.body }],
    },
  ],
}))

export const HeroCard = defineComponent((props: { title: string; body: string }) => ({
  type: 'element' as const,
  tag: 'div',
  layout: { flexDirection: 'column', gap: 5, padding: 10 },
  classes: ['card', 'card-hero'],
  children: [
    {
      type: 'element' as const,
      tag: 'div',
      classes: ['hero-badge'],
      children: [{ type: 'text' as const, content: '⚡ AXIOM FRAMEWORK' }],
    },
    {
      type: 'element' as const,
      tag: 'h2',
      classes: ['hero-title'],
      children: [{ type: 'text' as const, content: props.title }],
    },
    {
      type: 'element' as const,
      tag: 'p',
      classes: ['hero-body'],
      children: [{ type: 'text' as const, content: props.body }],
    },
  ],
}))
