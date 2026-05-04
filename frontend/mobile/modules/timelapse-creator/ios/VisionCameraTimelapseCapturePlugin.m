// VisionCameraTimelapseCapturePlugin.m
// VISION_EXPORT_SWIFT_FRAME_PROCESSOR 매크로로 "captureTimelapseFrame" 이름으로 등록.
// __attribute__((constructor)) 를 사용해 앱 로드 시점에 FrameProcessorPluginRegistry 에 자동 등록.

#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>

// Swift 생성 헤더 (VisionCameraTimelapseCapture Swift 클래스를 ObjC 에 노출)
#if __has_include("TimelapseCreator-Swift.h")
  #import "TimelapseCreator-Swift.h"
#else
  #import <TimelapseCreator/TimelapseCreator-Swift.h>
#endif

// "captureTimelapseFrame" 이름으로 plugin 등록.
// RN 측: const plugin = VisionCameraProxy.initFrameProcessorPlugin('captureTimelapseFrame')
VISION_EXPORT_SWIFT_FRAME_PROCESSOR(VisionCameraTimelapseCapture, captureTimelapseFrame)
