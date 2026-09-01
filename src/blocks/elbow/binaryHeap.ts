/**
 * A min-heap keyed by a score function, written for the A* open set in
 * `elbowRouter.ts`. Nothing exotic: `rescore` exists because A* re-scores a node
 * that is already queued and the heap has to be repaired around it.
 *
 * Written for pyblocks — not copied from anywhere.
 */
export class BinaryHeap<T> {
  private readonly items: T[] = []

  constructor(private readonly score: (item: T) => number) {}

  get size(): number {
    return this.items.length
  }

  push(item: T): void {
    this.items.push(item)
    this.bubbleUp(this.items.length - 1)
  }

  pop(): T | undefined {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last
      this.sinkDown(0)
    }
    return top
  }

  /** Repair the heap around an item whose score just changed. */
  rescore(item: T): void {
    const index = this.items.indexOf(item)
    if (index === -1) return
    this.bubbleUp(index)
    this.sinkDown(this.items.indexOf(item))
  }

  private bubbleUp(start: number): void {
    let index = start
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.score(this.items[index]) >= this.score(this.items[parent])) break
      this.swap(index, parent)
      index = parent
    }
  }

  private sinkDown(start: number): void {
    let index = start
    const length = this.items.length
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < length && this.score(this.items[left]) < this.score(this.items[smallest])) {
        smallest = left
      }
      if (right < length && this.score(this.items[right]) < this.score(this.items[smallest])) {
        smallest = right
      }
      if (smallest === index) break
      this.swap(index, smallest)
      index = smallest
    }
  }

  private swap(first: number, second: number): void {
    const held = this.items[first]
    this.items[first] = this.items[second]
    this.items[second] = held
  }
}
