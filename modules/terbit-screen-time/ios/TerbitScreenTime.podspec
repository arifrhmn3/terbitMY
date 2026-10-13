Pod::Spec.new do |s|
  s.name           = 'TerbitScreenTime'
  s.version        = '0.1.0'
  s.summary        = 'Terbit MY night restrictions (Screen Time: FamilyControls, ManagedSettings, DeviceActivity)'
  s.description    = 'Local Expo module: Screen Time authorization, the app picker and the night restriction schedule.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'FamilyControls', 'ManagedSettings', 'DeviceActivity', 'SwiftUI'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
