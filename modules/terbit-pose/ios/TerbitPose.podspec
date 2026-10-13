Pod::Spec.new do |s|
  s.name           = 'TerbitPose'
  s.version        = '0.1.0'
  s.summary        = 'Terbit MY camera rep counting (AVFoundation + Apple Vision body pose, on device)'
  s.description    = 'Local Expo module: camera permission, a live camera view and on-device body-pose joints for push-up and squat counting. Nothing is recorded or uploaded.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'Vision'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
