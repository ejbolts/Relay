import { useIsFocused, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useUser } from '../../session/SessionProvider';
import { recordAppNotices } from './appNotices';
import { launchPromptOpened, markWeeklyReviewShown, openLaunchPrompt } from './noticeMemory';
import { reviewRoutes } from './routes';
import { useReleaseNotice } from './useReleaseNotice';
import { useWeeklyReview } from './useWeeklyReview';

/**
 * Opens What's new once per release, or else last week's review at the start of a new week,
 * while Home is on screen. As on the web, only one opens by itself each time the app is opened;
 * the other waits for a later visit, and both stay in the bell.
 */
export function LaunchNotices() {
  const router = useRouter();
  const client = useQueryClient();
  const user = useUser();
  const focused = useIsFocused();
  const release = useReleaseNotice();
  const review = useWeeklyReview();
  const reviewDue = release.checked && review.ready && review.available && !review.shownThisWeek;
  const { currentStart } = review;

  useEffect(() => {
    if (!focused || launchPromptOpened(user.id) !== null) return;
    if (release.automatic) {
      openLaunchPrompt(user.id, 'release');
      router.push(reviewRoutes.releaseNotes);
    } else if (reviewDue) {
      openLaunchPrompt(user.id, 'weekly-review');
      markWeeklyReviewShown(user.id, currentStart);
      recordAppNotices(client, user.id, { weekly_review_seen: currentStart });
      router.push(reviewRoutes.weeklyReview);
    }
  }, [focused, user.id, release.automatic, reviewDue, currentStart, client, router]);

  return null;
}
