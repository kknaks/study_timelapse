Pod::Spec.new do |s|
  s.name           = 'TimelapseCreator'
  s.version        = '1.0.0'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  # NOTE: static_framework = true 는 ObjC __attribute__((constructor)) 를 dead code stripping
  # → VISION_EXPORT_SWIFT_FRAME_PROCESSOR 매크로의 plugin 등록이 안 됨.
  # VisionCamera 본인도 static_framework 안 씀. dynamic 으로.
  # s.static_framework = true   ← 의도적 비활성

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'

  # Swift/Objective-C compatibility + ObjC categories 강제 로드 (백업 보장)
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => '$(inherited) -ObjC'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
