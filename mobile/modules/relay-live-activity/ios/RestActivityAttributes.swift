import ActivityKit
import Foundation

/// The rest timer's Live Activity: what the app starts and updates, and the widget extension draws.
///
/// The app (through RelayLiveActivityModule) and the widget extension each compile their own copy
/// of this file; the config plugin copies it into the extension. ActivityKit pairs them by the
/// type's name and its Codable layout, so the two copies must stay identical.
@available(iOS 16.1, *)
public struct RestActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// The exercise whose set started the rest.
    public var exercise: String
    /// "Set 2 · 80 kg × 8": the set the rest leads to, when there is one left.
    public var nextSet: String?
    /// When the rest ends. The countdown is drawn from this date, so it ticks on its own.
    public var endsAt: Date
    /// The rest's full length, for the progress bar.
    public var totalSeconds: Int
    /// The seconds left while the workout is paused; nil while counting down.
    public var pausedSeconds: Int?

    public init(
      exercise: String, nextSet: String?, endsAt: Date, totalSeconds: Int, pausedSeconds: Int?
    ) {
      self.exercise = exercise
      self.nextSet = nextSet
      self.endsAt = endsAt
      self.totalSeconds = totalSeconds
      self.pausedSeconds = pausedSeconds
    }

    /// When the rest began, so the countdown and the progress bar share one range. It never comes
    /// after the end, which a ClosedRange requires.
    public var startedAt: Date {
      min(endsAt.addingTimeInterval(-Double(max(totalSeconds, 0))), endsAt)
    }
  }

  /// The workout the rest belongs to. A new rest in the same workout updates its activity in place.
  public var sessionId: String

  public init(sessionId: String) {
    self.sessionId = sessionId
  }
}
