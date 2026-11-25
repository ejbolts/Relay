import ActivityKit
import ExpoModulesCore
import Foundation

/// Shows the workout's rest countdown as a Live Activity on the Lock Screen and in the Dynamic
/// Island. The JS side (src/features/workout/restActivity.ts) calls `show` whenever the rest
/// changes and `end` when no rest is counting down; it never calls either off iOS.
///
/// The activity is updated only when the rest changes (started, paused, resumed, ±30 s). Between
/// updates the widget counts down by itself from `endsAt`, and the activity's stale date (the end of
/// the rest) lets the widget show "Rest complete" even while Relay is suspended.
public class RelayLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RelayLiveActivity")

    /// Whether this phone can show the activity now: Live Activities exist (iOS 16.2 and later) and
    /// the user hasn't turned them off for Relay in Settings.
    Function("isSupported") { () -> Bool in
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Starts the rest's activity, or updates the one already showing for this workout.
    /// `endsAt` is milliseconds since 1970, as JavaScript's `Date.now()` gives it.
    AsyncFunction("show") {
      (
        sessionId: String, exercise: String, nextSet: String?, endsAt: Double, totalSeconds: Int,
        pausedSeconds: Int?
      ) async throws in
      let state = RestActivityAttributes.ContentState(
        exercise: exercise,
        nextSet: nextSet,
        endsAt: Date(timeIntervalSince1970: endsAt / 1000),
        totalSeconds: totalSeconds,
        pausedSeconds: pausedSeconds
      )
      try await RestActivities.show(sessionId: sessionId, state: state)
    }

    /// Ends every rest activity at once, when the rest is over, skipped or the workout ends.
    AsyncFunction("end") { () async in
      await RestActivities.endAll(except: nil)
    }
  }
}

/// The ActivityKit calls, kept apart from the module so they read as plain Swift.
enum RestActivities {
  static func show(sessionId: String, state: RestActivityAttributes.ContentState) async throws {
    // A paused rest never goes stale; a running one does when it ends.
    let content = ActivityContent(
      state: state,
      staleDate: state.pausedSeconds == nil ? state.endsAt : nil
    )
    // Activities outlive the app, so after a relaunch the rest's activity may still be showing.
    let current = Activity<RestActivityAttributes>.activities.first {
      $0.attributes.sessionId == sessionId
        && ($0.activityState == .active || $0.activityState == .stale)
    }
    // Only one rest shows at a time: end any left from another workout.
    await endAll(except: current?.id)
    if let current {
      await current.update(content)
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    // Starting needs Relay in the foreground, which it is when a logged set starts a rest.
    _ = try Activity<RestActivityAttributes>.request(
      attributes: RestActivityAttributes(sessionId: sessionId),
      content: content,
      pushType: nil
    )
  }

  static func endAll(except id: String?) async {
    for activity in Activity<RestActivityAttributes>.activities where activity.id != id {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
