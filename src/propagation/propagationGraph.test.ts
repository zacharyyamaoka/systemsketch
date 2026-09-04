import { describe, expect, it } from 'vitest'
import { walkPropagationGraph } from './propagationGraph'

const chain = [
  { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
  { edgeId: 'bc', sourceId: 'b', sinkId: 'c' },
  { edgeId: 'cd', sourceId: 'c', sinkId: 'd' },
]

function ids(value: ReadonlySet<string>) {
  return [...value].sort()
}

describe('walkPropagationGraph', () => {
  it('keeps upstream and downstream bounds independent', () => {
    const result = walkPropagationGraph({
      edges: chain,
      upstreamStarts: ['b'],
      downstreamStarts: ['b'],
      upstreamSteps: 1,
      downstreamSteps: 2,
      initialNodes: ['b'],
    })
    expect(ids(result.nodes)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(result.edges)).toEqual(['ab', 'bc', 'cd'])
  })

  it('includes every fan-in and fan-out route at the same bound', () => {
    const result = walkPropagationGraph({
      edges: [
        { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
        { edgeId: 'cb', sourceId: 'c', sinkId: 'b' },
        { edgeId: 'bd', sourceId: 'b', sinkId: 'd' },
        { edgeId: 'be', sourceId: 'b', sinkId: 'e' },
      ],
      upstreamStarts: ['b'],
      downstreamStarts: ['b'],
      upstreamSteps: 1,
      downstreamSteps: 1,
      initialNodes: ['b'],
    })
    expect(ids(result.nodes)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(result.edges)).toEqual(['ab', 'bd', 'be', 'cb'])
  })

  it('retains the closing cable but terminates a cycle', () => {
    const result = walkPropagationGraph({
      edges: [
        { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
        { edgeId: 'bc', sourceId: 'b', sinkId: 'c' },
        { edgeId: 'ca', sourceId: 'c', sinkId: 'a' },
      ],
      upstreamStarts: ['a'],
      downstreamStarts: ['a'],
      upstreamSteps: 5,
      downstreamSteps: 5,
      initialNodes: ['a'],
    })
    expect(ids(result.nodes)).toEqual(['a', 'b', 'c'])
    expect(ids(result.edges)).toEqual(['ab', 'bc', 'ca'])
  })

  it('does not traverse when either direction is set to zero', () => {
    const result = walkPropagationGraph({
      edges: chain,
      upstreamStarts: ['b'],
      downstreamStarts: ['b'],
      upstreamSteps: 0,
      downstreamSteps: 0,
      initialNodes: ['b'],
    })
    expect(ids(result.nodes)).toEqual(['b'])
    expect(ids(result.edges)).toEqual([])
  })
})
