#!/usr/bin/env node
/**
 * Derive prior versions of a board from the board itself.
 *
 * SystemSketch has no version store yet, and the Compare panel needs two
 * endpoints. Rather than hand-authoring a second board — which would drift from
 * the first and quietly diff things nobody meant to change — this walks the
 * saved `.systemsketch` backwards through a named list of edits. Everything the
 * script does not touch stays byte-identical, so every row the panel shows is a
 * change this file made on purpose.
 *
 * That is also what a real version history *is*: the same document, earlier.
 *
 *   v1  the oldest — before all five edits
 *   v2  the middle — after two of them
 *   current  the fixture on disk, untouched
 *
 * Usage:
 *   node scripts/make_compare_history.mjs sketches/review/diff-review-modal.systemsketch
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const input = process.argv[2] ?? 'sketches/review/diff-review-modal.systemsketch'
const path = resolve(process.cwd(), input)
const original = JSON.parse(readFileSync(path, 'utf8'))

const stem = path.replace(/\.systemsketch$/, '')

/** Deep clone through JSON — these documents are plain data by construction. */
function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

function findShape(doc, id) {
	return doc.records.find((record) => record.id === id && record.typeName === 'shape')
}

function findBinding(doc, id) {
	return doc.records.find((record) => record.id === id && record.typeName === 'binding')
}

/** Rename a Block. Exercises MODIFIED, and the word diff: `run_` must survive. */
function retitle(doc, shapeId, title) {
	findShape(doc, shapeId).props.title = title
}

/** Give a Block back an input it has since lost. Exercises REMOVED. */
function restoreInput(doc, shapeId, port, index) {
	const inputs = findShape(doc, shapeId).props.inputs
	inputs.splice(index, 0, port)
}

/** Take away an input it has not gained yet. Exercises ADDED. */
function dropInput(doc, shapeId, portId) {
	const block = findShape(doc, shapeId)
	block.props.inputs = block.props.inputs.filter((port) => port.id !== portId)
}

/** Change one field of one port. Exercises MODIFIED at port level. */
function setOutputType(doc, shapeId, portId, type) {
	const port = findShape(doc, shapeId).props.outputs.find((candidate) => candidate.id === portId)
	port.type = type
}

/** Move a cable end to a different port. Exercises REWIRED. */
function rebind(doc, bindingId, toId, portId) {
	const binding = findBinding(doc, bindingId)
	binding.toId = toId
	binding.props.portId = portId
}

const MODEL_PORT = {
	id: 'in_model',
	name: 'model',
	type: 'Model',
	visible: true,
}

// ---- v2: two edits ago ----------------------------------------------------
const v2 = clone(original)
retitle(v2, 'shape:predict', 'run_inference')
rebind(v2, 'binding:cable_xm-start', 'shape:load', 'out_frames')

// ---- v1: five edits ago ---------------------------------------------------
const v1 = clone(v2)
restoreInput(v1, 'shape:predict', MODEL_PORT, 1)
dropInput(v1, 'shape:predict', 'in_threshold')
setOutputType(v1, 'shape:overlay', 'out_image', 'RGB')

writeFileSync(`${stem}.v1.systemsketch`, `${JSON.stringify(v1, null, 2)}\n`)
writeFileSync(`${stem}.v2.systemsketch`, `${JSON.stringify(v2, null, 2)}\n`)

console.log(`wrote ${stem}.v1.systemsketch`)
console.log(`  v1 → current: title renamed, threshold added, model removed, image type changed, cable rewired`)
console.log(`wrote ${stem}.v2.systemsketch`)
console.log(`  v2 → current: title renamed, cable rewired`)
