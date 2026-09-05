export { CompareProvider, CompareTrigger, useCompare } from './CompareLauncher'
export { CompareDialog } from './CompareDialog'
export { PropertyTable } from './PropertyTable'
export { CodeView } from './CodeView'
export { BoardRender, useLinkedCameras } from './BoardRender'
export {
	CHANGE_KINDS,
	SUBJECT_KINDS,
	canWordDiff,
	compareBoards,
	recordsOfSnapshot,
	type BoardCompare,
	type ChangeKind,
	type CompareChange,
	type FieldChange,
	type SubjectKind,
} from './compareModel'
export { collapseContext, lineDiff, stableJson, type DiffLine } from './lineDiff'
/*
 * `compareSource.ts` is superseded by `src/history/boardHistory.ts`, which reads
 * the same `.vN` siblings and additionally carries each file's real mtime and a
 * measured title. Kept exported while nothing else has been migrated off it, so
 * a peer's in-flight import does not break mid-track.
 */
export { discoverHistory, loadEntrySnapshot, type HistoryEntry } from './compareSource'
