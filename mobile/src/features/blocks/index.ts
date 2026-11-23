// Training blocks for other screens. Home places `HomeTrainingBlockCard` (the web's training
// block card and its offer to start the first block); the rest are its parts.
export {
  HomeTrainingBlockCard,
  TrainingBlockCard,
  TrainingBlockOfferCard,
} from './TrainingBlockCard';
export type { TrainingBlockCardStyle } from './TrainingBlockCard';
export { BlockStrip } from './BlockStrip';
export { selectBlock, useBlockScope, useTrainingBlocks } from './blockQueries';
export { blockRoutes } from './routes';
