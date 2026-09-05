/**
 * One history list, two panels.
 *
 * `HistoryList` is the component; `boardHistory` measures the records; the
 * Compare modal and the Block inspector are its only consumers. A third panel
 * that wanted history should import from here rather than grow a fourth.
 */

export { HistoryList, type HistoryDensity, type HistoryListProps } from './HistoryList'
export { ElementHistoryPanel } from './ElementHistoryPanel'
export {
	absoluteTime,
	metaLine,
	relativeTime,
	type HistoryAuthor,
	type HistoryRecord,
} from './historyModel'
export {
	boardHistoryRecords,
	buildVersionChain,
	discoverVersions,
	elementHistoryRecords,
	loadVersionSnapshot,
	type VersionFile,
	type VersionStep,
} from './boardHistory'
