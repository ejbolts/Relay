import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppTabBar } from './AppTabBar';
import { TodayScreen, type TodayScreenProps } from './TodayScreen';
import { useHomeLayout } from './useHomeLayout';
import type {
  DashboardData,
  PersonalRecord,
  TrackedWorkout,
  User,
  WorkoutTypeColors,
} from './types';
import { UserContext, type UserSession } from './userContext';
import { AccountSettings, AccountSessionSettings } from './AccountSettings';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { WeightUnit } from './weightUnits';

afterEach(() => {
  vi.unstubAllGlobals();
});

const colors: WorkoutTypeColors = {
  upper: '#8b5cf6',
  lower: '#f59e0b',
  push: '#ef476f',
  pull: '#3b82f6',
  full_body: '#14b8a6',
  cardio: '#22c55e',
  other: '#94a3b8',
};

function stubWindow(hash: string) {
  vi.stubGlobal('window', {
    history: { state: null },
    location: { hash },
    localStorage: { getItem: () => null },
  });
}

const account: User = {
  id: 'user-1',
  username: 'lifter',
  display_name: 'Lifter',
  is_admin: true,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
};

function renderSignedIn(hash: string, user: User) {
  stubWindow(hash);
  const session: UserSession = {
    user,
    updateUser: vi.fn(),
    signOut: vi.fn(),
    accountDeleted: vi.fn(),
  };
  return renderToStaticMarkup(
    <UserContext.Provider value={session}>
      <App />
    </UserContext.Provider>,
  );
}

function TodayPreview(props: Omit<TodayScreenProps, 'home'>) {
  const home = useHomeLayout();
  return <TodayScreen home={home} {...props} />;
}

function renderToday(
  overrides: Partial<Parameters<typeof TodayScreen>[0]> = {},
  weightUnit: WeightUnit = 'kg',
) {
  return renderToStaticMarkup(
    <TrainingPreferencesContext.Provider
      value={{
        preferences: {
          preferred_weight_unit: weightUnit,
          week_start: 'monday',
          zone2_goal_minutes: 150,
          weekly_muscle_set_goal: 10,
        },
        error: null,
        applySaved: vi.fn(),
      }}
    >
      <TodayPreview
        data={
          {
            workouts_this_week: 4,
            sets_this_week: 25,
            volume_this_week_kg: 23057.5,
            current_streak: 4,
            cardio_minutes_this_week: 30,
            zone2: {
              week_start: '2026-10-05',
              week_end: '2026-10-11',
              goal_minutes: 150,
              completed_minutes: 30,
              remaining_minutes: 120,
              percentage: 20,
              complete: false,
            },
            weekly_sets: {
              week_start: '2026-10-05',
              week_end: '2026-10-11',
              raw_sets: 25,
              effective_sets: 25,
              unrated_sets: 0,
              low_rpe_sets: 0,
              rpe_logging_percent: 33.3,
              muscle_groups: [
                { muscle_group: 'Quadriceps', raw_sets: 10, effective_sets: 10, average_rpe: null },
                { muscle_group: 'Side delts', raw_sets: 0, effective_sets: 0, average_rpe: null },
              ],
            },
            recommendation: {
              category: 'pull',
              session_name: 'Pull workout',
              rotation_next: 'pull',
              reason: 'Next in your Push → Pull → Legs rotation.',
              muscle_frequency: [],
            },
          } as unknown as DashboardData
        }
        workouts={[]}
        measurements={[]}
        personalRecords={[]}
        categoryColors={colors}
        workoutStartedAt={null}
        todayBodyweight={null}
        onSaveBodyweight={vi.fn()}
        onStartTemplate={vi.fn()}
        onStartEmpty={vi.fn()}
        onResumeWorkout={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenProgress={vi.fn()}
        onOpenCardio={vi.fn()}
        onOpenBody={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenVideos={vi.fn()}
        today="2026-10-06"
        {...overrides}
      />
    </TrainingPreferencesContext.Provider>,
  );
}

describe('App startup', () => {
  it.each([
    ['kg', '100×6', '100 kg × 6'],
    ['lb', '220.46×6', '220.46 lb × 6'],
  ] as const)(
    'shows the Home Up next source set in %s while preserving its kg value',
    (unit, expectedSummary, fullSummary) => {
      const workout: TrackedWorkout = {
        id: 'source-workout',
        name: 'Pull day',
        workout_date: '2026-10-05',
        category: 'pull',
        notes: null,
        duration_minutes: 30,
        start_time: null,
        end_time: null,
        is_sample: true,
        created_at: '2026-10-05T10:00:00Z',
        updated_at: '2026-10-05T10:00:00Z',
        movements: [
          {
            id: 'source-movement',
            order_index: 0,
            notes: null,
            machine_photos: [],
            superset_group_id: null,
            superset_name: null,
            exercise: {
              id: 'deadlift',
              name: 'Deadlift',
              category: 'pull',
              kind: 'strength',
              muscle_group: 'Back',
              equipment: 'Barbell',
              is_custom: false,
              is_favorite: false,
              muscle_contributions: [],
            },
            sets: [
              {
                id: 'source-set',
                order_index: 0,
                weight_kg: 100,
                reps: 6,
                rpe: null,
                rest_seconds: null,
                duration_seconds: null,
                distance_km: null,
                incline_percent: null,
                speed_kph: null,
                bodyweight_kg: null,
                percentile: null,
                warmup: false,
                set_type: 'normal',
                failed: false,
                target_reps: null,
                notes: null,
                completed: true,
              },
            ],
          },
        ],
      };
      const before = structuredClone(workout);
      const markup = renderToday({ workouts: [workout] }, unit);
      expect(markup).toContain('Up next');
      expect(markup).toContain(`<b class="num" title="${fullSummary}">${expectedSummary}</b>`);
      expect(markup).toContain('<small>Last: Mon 5 Oct</small>');
      expect(markup).toContain('aria-label="Start pull workout"');
      expect(markup).toContain('aria-label="Start empty workout"');
      expect(workout).toEqual(before);
      expect(workout.movements[0].sets[0].weight_kg).toBe(100);
    },
  );

  it.each([null, { category: 'pull' }])(
    'keeps the Empty shortcut available without a previous session (%j)',
    (recommendation) => {
      const markup = renderToday({
        workouts: [],
        data: { recommendation } as unknown as DashboardData,
      });
      expect(markup).toContain('Start workout');
      expect(markup).toContain('aria-label="Start empty workout"');
      expect(markup).toContain('primary next-session-empty');
    },
  );

  it('shows the profile section with all-time totals and strength PRs', () => {
    const record = (record_type: string, value: number) =>
      ({
        id: `${record_type}-${value}`,
        record_type,
        value,
        achieved_date: '2026-10-01',
      }) as unknown as PersonalRecord;
    const markup = renderToday({
      profile: {
        display_name: 'Sample Lifter',
        username: 'sample',
        profile_photo_url: null,
        created_at: '2025-03-02T10:00:00Z',
      },
      data: {
        history: {
          total_workouts: 1260,
          first_workout_date: null,
          last_workout_date: null,
          has_sample_workouts: true,
        },
        total_cardio_sessions: 38,
        recommendation: null,
      } as unknown as DashboardData,
      personalRecords: [
        record('weight', 100),
        record('reps_at_weight', 8),
        record('estimated_1rm', 120),
        record('weight', 0),
      ],
    });

    expect(markup).toContain('id="today-profile-title">Sample Lifter</h2>');
    expect(markup).toContain('@sample · since Mar 2025');
    expect(markup).toMatch(/Workouts<\/dt><dd class="num">1,260<\/dd>/);
    expect(markup).toMatch(/Cardio<\/dt><dd class="num">38<\/dd>/);
    expect(markup).toMatch(/PRs<\/dt><dd class="num">2<\/dd>/);
  });

  it('omits the profile section outside the signed-in app', () => {
    expect(renderToday()).not.toContain('today-profile');
  });

  it('renders a Today-shaped skeleton before training data has loaded', () => {
    stubWindow('');

    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('today-loading-skeleton');
    expect(markup).toContain('Loading your training summary');
    expect(markup).toContain('aria-label="Main navigation"');
  });

  it('shows the recommendation, weekly totals, muscles, Zone 2 and quick check-in on Today', () => {
    const markup = renderToday();

    expect(markup).toContain('<h1>Home</h1>');
    expect(markup).toContain('Up next');
    expect(markup).toContain('Pull day');
    expect(markup).toContain('Workouts</span><strong>4</strong>');
    expect(markup).toContain('Cardio sessions</span><strong>0</strong>');
    expect(markup).toContain('Body weight</span><strong>–</strong><em>No check-ins</em>');
    expect(markup).not.toContain('Working sets</span>');
    expect(markup).toContain('Quadriceps');
    expect(markup).not.toContain('Side delts</span>');
    expect(markup).toContain('1 muscles not trained yet');
    expect(markup).toContain('120 min to go');
    expect(markup).toContain('4 days');
    expect(markup).toContain('Bodyweight in kilograms');
    expect(markup).toContain('aria-label="Video logger"');
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).not.toContain('live-workout-card');
  });

  it('shows each personal zone goal using only its qualifying minutes, without a graph', () => {
    const markup = renderToday({
      data: {
        cardio_minutes_this_week: 300,
        cardio_goals: [
          {
            zone: 2,
            goal_minutes: 180,
            completed_minutes: 60,
            remaining_minutes: 120,
            complete: false,
          },
          {
            zone: 4,
            goal_minutes: 30,
            completed_minutes: 30,
            remaining_minutes: 0,
            complete: true,
          },
        ],
      } as DashboardData,
    });
    expect(markup).toContain('<b>Zone 2</b> <small>60 / 180 min</small>');
    expect(markup).toContain('home-cardio-goal complete"><b>Zone 4</b> <small>30 / 30 min');
    expect(markup).toContain('1 of 2 goals reached');
    expect(markup).not.toContain('300 /');
    expect(markup).not.toContain('pulse-meter');
  });

  it.each(['kg', 'lb'] as const)('uses %s for the Home Bodyweight axis', (unit) => {
    const measurements = [85, 84, 83].map((weight_kg, index) => ({
      id: String(index),
      measurement_date: `2026-10-0${6 - index}`,
      weight_kg,
      body_fat_pct: null,
      notes: null,
      is_sample: true,
      created_at: '2026-10-06T00:00:00Z',
    }));
    const markup = renderToday({ measurements }, unit);
    const chart = markup.match(
      /<svg[^>]*aria-label="Bodyweight in [^"]+, last 30 check-ins"[^>]*>([\s\S]*?)<\/svg>/,
    )![1];
    const labels = [...chart.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) =>
      Number(match[1]),
    );
    expect(labels).toHaveLength(3);
    expect(Math.min(...labels)).toBeGreaterThan(unit === 'kg' ? 80 : 180);
    expect(Math.max(...labels)).toBeLessThan(unit === 'kg' ? 90 : 200);
  });

  it('replaces the recommendation with a resumable live workout', () => {
    const markup = renderToday({ workoutStartedAt: Date.now() - 65_000, todayBodyweight: 84.1 });

    expect(markup).toContain('live-workout-card');
    expect(markup).toContain('Workout live');
    expect(markup).toContain('1:05');
    expect(markup).toContain('Saved today · 84.1 kg');
    expect(markup).not.toContain('next-session-title');
  });

  it('marks the active tab and shows live time on the Start button', () => {
    const idle = renderToStaticMarkup(
      <AppTabBar active="training" workoutStartedAt={null} onSelect={vi.fn()} onStart={vi.fn()} />,
    );
    expect(idle.match(/class="app-tab /g)).toHaveLength(5);
    expect(idle).toContain('aria-label="Start workout"');
    expect(idle).toMatch(
      /class="app-tab active" aria-current="page"><svg[^>]*>.*?<\/svg><span>Training<\/span>/,
    );

    const live = renderToStaticMarkup(
      <AppTabBar
        active={null}
        workoutStartedAt={Date.now() - 125_000}
        onSelect={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(live).toContain('aria-label="Resume active workout"');
    expect(live).toContain('2:05');
    expect(live).not.toContain('aria-current="page"');

    // Away from the workout, the live dot becomes a timer counting the rest down.
    const resting = renderToStaticMarkup(
      <AppTabBar
        active="dashboard"
        workoutStartedAt={Date.now() - 125_000}
        restEndsAt={Date.now() + 90_500}
        onSelect={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(resting).toContain('class="app-tab app-tab-start live resting"');
    expect(resting).toContain('aria-label="Resume active workout, rest 1:31 left"');
    expect(resting).toContain('<span class="num">1:31</span>');
    expect(resting).not.toContain('live-dot');
    expect(resting).not.toContain('2:05');

    const restOver = renderToStaticMarkup(
      <AppTabBar
        active="dashboard"
        workoutStartedAt={Date.now() - 125_000}
        restEndsAt={Date.now() - 1_000}
        onSelect={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(restOver).toContain('aria-label="Resume active workout"');
    expect(restOver).toContain('live-dot');
  });

  it.each([
    ['settings', 'Settings', 'Preferences • privacy • data'],
    ['videos', 'Videos', 'Workout clips • uploads'],
  ])('renders the overlay header on the %s screen', (tab, title, subtitle) => {
    stubWindow(`#${tab}`);

    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('class="overlay-screen-header"');
    expect(markup).toContain('with-overlay-header');
    expect(markup).toContain('aria-label="Go back"');
    expect(markup).toContain(`<strong>${title}</strong>`);
    expect(markup).toContain(`<span>${subtitle}</span>`);
  });

  it.each(['dashboard', 'history', 'progress', 'cardio', 'body'])(
    'uses the in-page title and tab bar instead of an overlay header on %s',
    (tab) => {
      stubWindow(`#${tab}`);

      const markup = renderToStaticMarkup(<App />);

      expect(markup).not.toContain('overlay-screen-header');
      expect(markup).not.toContain('with-overlay-header');
      expect(markup).toContain('class="tracker-app has-tab-bar"');
    },
  );

  it('shows the Profile screen with the account name, username and admin badge', () => {
    const markup = renderSignedIn('#profile', account);

    expect(markup).toContain('<strong>Profile</strong>');
    expect(markup).toContain('lifter');
    expect(markup).toContain('Admin');
    expect(markup).toContain('Edit profile');
    expect(markup).toContain('Loading profile');
    expect(markup).not.toContain('Change password');
    expect(markup).not.toContain('Sign out');
    expect(markup).not.toContain('Delete account');
    expect(markup).not.toContain('Search settings');
  });

  it('renders sharing and security panels for Settings', () => {
    const markup = renderToStaticMarkup(
      <UserContext.Provider
        value={{ user: account, updateUser: vi.fn(), signOut: vi.fn(), accountDeleted: vi.fn() }}
      >
        <AccountSettings />
        <AccountSessionSettings />
      </UserContext.Provider>,
    );

    expect(markup).toContain('Profile sharing');
    expect(markup).toContain('Loading your sharing choices');
    expect(markup).toContain('Change password');
    expect(markup).toContain('Sign out');
    expect(markup).toContain('Delete account');
    expect(markup).not.toContain('Edit profile');
    expect(markup).not.toContain('profile-friends-title');
    expect(markup).not.toContain('Open Social');
  });

  it('keeps reloaded profile links usable and sends old shared-list links to Social', () => {
    for (const hash of ['#shared-profile']) {
      const markup = renderSignedIn(hash, account);

      expect(markup).toContain('<strong>Profile</strong>');
      expect(markup).toContain('Edit profile');
      expect(markup).not.toContain('Profile sharing');
      expect(markup).not.toContain('View shared profiles');
    }
    const social = renderSignedIn('#shared', account);
    expect(social).toContain('aria-current="page"');
    expect(social).toContain('<span>Social</span>');
    expect(social).not.toContain('<strong>Profile</strong>');
  });

  it('offers the Profile entry point on Today', () => {
    const today = renderToday({ onOpenProfile: vi.fn(), profileLabel: 'Lifter' });
    expect(today).toContain('aria-label="Profile: Lifter"');
  });

  it('shows the profile photo on the Today profile button', () => {
    const today = renderToday({
      onOpenProfile: vi.fn(),
      profileLabel: 'Lifter',
      profilePhotoUrl: '/api/profile/photo?v=abc',
    });
    expect(today).toContain('src="/api/profile/photo?v=abc"');
  });

  it('hides the video entry points for accounts that cannot upload videos', () => {
    expect(renderToday({ onOpenVideos: undefined })).not.toContain('aria-label="Video logger"');

    const markup = renderSignedIn('#videos', { ...account, can_upload_videos: false });
    expect(markup).not.toContain('<strong>Videos</strong>');
    expect(markup).not.toContain('video-module');
  });

  it('hides the tab bar during a live workout', () => {
    stubWindow('#log');

    const markup = renderToStaticMarkup(<App />);

    expect(markup).not.toContain('aria-label="Main navigation"');
  });
});
