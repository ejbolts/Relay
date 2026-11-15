import { createContext, useContext } from 'react';

export const LiveWorkoutSheetContext = createContext<{ minimise: () => void } | null>(null);
export const useLiveWorkoutSheet = () => useContext(LiveWorkoutSheetContext);
