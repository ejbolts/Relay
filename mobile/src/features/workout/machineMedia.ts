import type { MachinePhoto, MachineSetting } from '../../../../frontend/src/types';
import { uploadFile } from '../../data/uploadFile';

/** Saves a photo of a machine for an exercise, with its name and settings, as the web does. */
export function uploadMachinePhoto(
  exerciseId: string,
  file: { uri: string; name: string; type: string },
  caption: string,
  settings: MachineSetting[],
): Promise<MachinePhoto> {
  return uploadFile<MachinePhoto>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/machine-photos`,
    'POST',
    file,
    {
      fields: { caption, machine_settings: JSON.stringify({ settings }) },
      failure: 'Relay could not save this photo.',
    },
  );
}
