import { useIsFocused, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { nextOnboardingPrompt } from '../../../../frontend/src/appGuideProgress';
import { useUser } from '../../session/SessionProvider';
import { appTourWaiting, useAppTour } from '../guides/tourProgress';
import { recordAppNotices } from './appNotices';
import { launchPromptOpened, markWeeklyReviewShown, openLaunchPrompt } from './noticeMemory';
import { reviewRoutes } from './routes';
import { useReleaseNotice } from './useReleaseNotice';
import { useWeeklyReview } from './useWeeklyReview';

/**
 * Opens What's new once per release, or else last week's review at the start of a new week,
 * while Home is on screen. As on the web, only one opens by itself each time the app is opened;
 * the other waits for a later visit, and both stay in the bell. A new account's quick tour comes
 * first (Home's guides open it), so neither opens by itself during that visit.
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
  const tour = useAppTour(user.id);

  useEffect(() => {
    if (!focused || launchPromptOpened(user.id) !== null) return;
    const prompt = nextOnboardingPrompt({
      tour: !!tour || appTourWaiting(user.id),
      importStep: false,
      release: release.automatic,
      releaseHeld: false,
    });
    if (prompt === 'tour') return;
    if (prompt === 'release') {
      openLaunchPrompt(user.id, 'release');
      router.push(reviewRoutes.releaseNotes);
    } else if (reviewDue) {
      openLaunchPrompt(user.id, 'weekly-review');
      markWeeklyReviewShown(user.id, currentStart);
      recordAppNotices(client, user.id, { weekly_review_seen: currentStart });
      router.push(reviewRoutes.weeklyReview);
    }
  }, [focused, user.id, tour, release.automatic, reviewDue, currentStart, client, router]);

  return null;
}
