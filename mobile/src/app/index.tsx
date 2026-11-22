import { AccountScreen } from '../features/account/AccountScreen';
import { apiOrigin } from '../features/account/api';
import { TrainingScreen } from '../features/training/TrainingScreen';

export default function Home() {
  return apiOrigin ? <AccountScreen /> : <TrainingScreen />;
}
