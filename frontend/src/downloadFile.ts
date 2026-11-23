/** Saves a prepared file through the browser's normal download flow. */
export function downloadFile(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export { fileNamePart, workoutExportFileName } from './downloadFileName';
