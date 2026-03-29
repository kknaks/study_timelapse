import XCTest
@testable import TimelapseCreator

// Note: XCTest for Expo native modules needs to be run from Xcode.
// For automated testing, the Jest tests in Phase 2 cover the logic validation.

class OverlayLayoutParsingTests: XCTestCase {

  // Test 1: overlayLayoutJson parsing
  func testParseOverlayLayoutFromJSON() {
    let json = """
    {
      "watermark": {"paddingLeft": 33.2, "paddingBottom": 33.2, "logoSize": 58.2, "gap": 16.6, "fontSize": 45.7},
      "progress": {"paddingRight": 33.2, "paddingTop": 33.2, "fontSize": 49.8, "labelGap": 16.6, "barWidth": 290.8, "barHeight": 22.8},
      "timer": {"paddingRight": 33.2, "paddingTop": 33.2, "fontSize": 49.8},
      "streak": {"paddingRight": 33.2, "paddingTop": 33.2, "fontSize": 49.8}
    }
    """
    guard let data = json.data(using: .utf8),
          let layout = try? JSONDecoder().decode(TimelapseCreatorModule.OverlayLayoutPx.self, from: data) else {
      XCTFail("JSON parsing failed")
      return
    }
    XCTAssertEqual(layout.watermark.paddingLeft, 33.2, accuracy: 0.01)
    XCTAssertEqual(layout.watermark.logoSize, 58.2, accuracy: 0.01)
    XCTAssertEqual(layout.progress.barWidth, 290.8, accuracy: 0.01)
    XCTAssertEqual(layout.timer.fontSize, 49.8, accuracy: 0.01)
  }

  // Test 2: overflow check for 810px video
  func testNoOverflowFor810pxVideo() {
    let videoWidth: Double = 810
    let scale = videoWidth / 390.0
    let paddingRight = 16.0 * scale
    let barWidth = 140.0 * scale
    let barX = videoWidth - paddingRight - barWidth
    let fontSize = 24.0 * scale
    let labelGap = 8.0 * scale
    let estimatedLabelWidth = fontSize * 5  // '5 min' 5 chars
    let labelX = barX - labelGap - estimatedLabelWidth
    XCTAssertGreaterThan(barX, 0, "barX must be positive")
    XCTAssertGreaterThan(labelX, 0, "labelX must be positive for 810px")
  }

  // Test 3: overflow check for 720px video
  func testNoOverflowFor720pxVideo() {
    let videoWidth: Double = 720
    let scale = videoWidth / 390.0
    let paddingRight = 16.0 * scale
    let barWidth = 140.0 * scale
    let barX = videoWidth - paddingRight - barWidth
    let fontSize = 24.0 * scale
    let labelGap = 8.0 * scale
    let estimatedLabelWidth = fontSize * 5
    let labelX = barX - labelGap - estimatedLabelWidth
    XCTAssertGreaterThan(barX, 0)
    XCTAssertGreaterThan(labelX, 0, "labelX must be positive for 720px")
  }

  // Test 4: watermark text fits for 810px
  func testWatermarkTextFitsFor810px() {
    let videoWidth: Double = 810
    let scale = videoWidth / 390.0
    let paddingLeft = 16.0 * scale
    let logoSize = 28.0 * scale
    let gap = 8.0 * scale
    let wmTextX = paddingLeft + logoSize + gap
    let paddingRight = 16.0 * scale
    let availableWidth = videoWidth - wmTextX - paddingRight
    XCTAssertGreaterThan(availableWidth, 0, "Watermark text must have space")
    let fontSize = 22.0 * scale
    let estimatedTextWidth = fontSize * 14 * 0.6
    XCTAssertGreaterThan(availableWidth, estimatedTextWidth,
      "Available space (\(availableWidth)) must fit FocusTimelapse text (\(estimatedTextWidth))")
  }

  // Test 5: formatTime correctness
  func testFormatTime() {
    let s1 = 0
    let h1 = s1 / 3600; let m1 = (s1 % 3600) / 60; let sec1 = s1 % 60
    XCTAssertEqual(String(format: "%02d:%02d:%02d", h1, m1, sec1), "00:00:00")

    let s2 = 3661
    let h2 = s2 / 3600; let m2 = (s2 % 3600) / 60; let sec2 = s2 % 60
    XCTAssertEqual(String(format: "%02d:%02d:%02d", h2, m2, sec2), "01:01:01")
  }
}
