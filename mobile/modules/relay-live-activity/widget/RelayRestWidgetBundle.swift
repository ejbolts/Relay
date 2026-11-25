import SwiftUI
import WidgetKit

/// The widget extension's entry point. It holds only the rest timer's Live Activity; Relay has no
/// Home Screen widgets.
@main
struct RelayRestWidgetBundle: WidgetBundle {
  var body: some Widget {
    RestActivityWidget()
  }
}
