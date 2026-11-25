Pod::Spec.new do |s|
  s.name           = 'RelayLiveActivity'
  s.version        = '1.0.0'
  s.summary        = "Relay's rest timer as an iOS Live Activity"
  s.description    = "Starts, updates and ends the rest timer's Live Activity with ActivityKit."
  s.license        = 'UNLICENSED'
  s.author         = 'Relay'
  s.homepage       = 'https://github.com/ejbolts/Relay'
  # Expo SDK 58 apps target iOS 16.4, which has every ActivityKit API used here (16.2 and later).
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit'

  # Only the module and its attributes; the widget's SwiftUI lives in ../widget, which the config
  # plugin copies into the widget extension.
  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
