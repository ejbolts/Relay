import ActivityKit
import SwiftUI
import WidgetKit

/// Relay's accent blue (mobile/src/ui/theme.ts), which the activity can't read from the app.
private let relayAccent = Color(red: 0x2C / 255, green: 0x74 / 255, blue: 0xD0 / 255)
/// Tapping the activity, on the Lock Screen or in the Island, opens the live workout's logger
/// (mobile/src/features/workout/workoutLink.ts keeps it through a cold start).
private let workoutURL = URL(string: "relay-mobile://workout")

/// The rest timer on the Lock Screen and in the Dynamic Island.
struct RestActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestActivityAttributes.self) { context in
      RestLockScreenView(state: context.state, isStale: context.isStale)
        .activityBackgroundTint(Color.black.opacity(0.75))
        .activitySystemActionForegroundColor(.white)
        .widgetURL(workoutURL)
    } dynamicIsland: { context in
      let state = context.state
      let stale = context.isStale
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          RestIcon(state: state, isStale: stale)
            .font(.title2)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestTimeText(state: state, isStale: stale)
            .font(.title2.weight(.semibold))
            .frame(maxWidth: 96, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(state.exercise)
            .font(.headline)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            RestDetailText(state: state, isStale: stale)
            RestProgress(state: state, isStale: stale)
          }
        }
      } compactLeading: {
        RestIcon(state: state, isStale: stale)
      } compactTrailing: {
        // A timer Text takes all the width it can; the frame keeps it to the time itself.
        RestTimeText(state: state, isStale: stale)
          .frame(maxWidth: 44, alignment: .trailing)
      } minimal: {
        RestIcon(state: state, isStale: stale)
      }
      .widgetURL(workoutURL)
      .keylineTint(relayAccent)
    }
  }
}

/// The Lock Screen banner: the exercise, the time left, the next set and a progress bar.
struct RestLockScreenView: View {
  let state: RestActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        RestIcon(state: state, isStale: isStale)
        Text(state.exercise)
          .font(.headline)
          .lineLimit(1)
        Spacer(minLength: 8)
        RestTimeText(state: state, isStale: isStale)
          .font(.title.weight(.semibold))
          .frame(maxWidth: 120, alignment: .trailing)
      }
      RestDetailText(state: state, isStale: isStale)
      RestProgress(state: state, isStale: isStale)
    }
    .foregroundStyle(.white)
    .padding(16)
  }
}

/// A timer while the rest runs, a pause symbol while paused, a tick once it's over.
struct RestIcon: View {
  let state: RestActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    Image(systemName: isStale ? "checkmark.circle.fill" : state.pausedSeconds != nil ? "pause.circle.fill" : "timer")
      .foregroundStyle(isStale ? Color.green : relayAccent)
      .accessibilityHidden(true)
  }
}

/// The time left. While running it counts down by itself from the rest's end date, so the app
/// never has to update the activity every second.
struct RestTimeText: View {
  let state: RestActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    Group {
      if isStale {
        Text("0:00")
      } else if let paused = state.pausedSeconds {
        Text(clock(paused))
      } else {
        Text(timerInterval: state.startedAt...state.endsAt, countsDown: true)
      }
    }
    .monospacedDigit()
    .multilineTextAlignment(.trailing)
  }

  private func clock(_ seconds: Int) -> String {
    let left = max(seconds, 0)
    return String(format: "%d:%02d", left / 60, left % 60)
  }
}

/// "Rest complete" once it's over, "Paused" while paused, otherwise the next set.
struct RestDetailText: View {
  let state: RestActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    Text(detail)
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .lineLimit(1)
  }

  private var detail: String {
    if isStale { return state.nextSet.map { "Rest complete · \($0)" } ?? "Rest complete" }
    if state.pausedSeconds != nil { return "Paused" }
    return state.nextSet.map { "Next: \($0)" } ?? "Rest"
  }
}

/// The share of the rest still to go, shrinking by itself while it runs, like the app's rest bar
/// (frontend/src/restProgress.ts). It goes once the rest is over.
struct RestProgress: View {
  let state: RestActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    if !isStale {
      Group {
        if let paused = state.pausedSeconds {
          let total = Double(max(state.totalSeconds, paused, 1))
          ProgressView(value: Double(max(paused, 0)), total: total)
        } else {
          ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: true) {
            EmptyView()
          } currentValueLabel: {
            EmptyView()
          }
        }
      }
      .progressViewStyle(.linear)
      .tint(relayAccent)
    }
  }
}
