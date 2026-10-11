Pod::Spec.new do |s|
  s.name           = 'TerbitAlarms'
  s.version        = '0.1.0'
  s.summary        = 'Terbit MY native alarms (AlarmKit on iOS 26+)'
  s.description    = 'Local Expo module that schedules real system alarms for Terbit MY.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'

  # AlarmKit only exists on iOS 26+. Weak-linking keeps the app launching on
  # older iOS versions; every AlarmKit call is guarded with #available.
  s.weak_frameworks = 'AlarmKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
