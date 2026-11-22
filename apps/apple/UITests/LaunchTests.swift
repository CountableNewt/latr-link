import XCTest

final class LaunchTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor
    func testSignedOutAppHasAccessibleLogin() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-signed-out"]
        app.launch()
        XCTAssertTrue(app.textFields["AT Protocol handle"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Sign in"].exists)
        XCTAssertFalse(app.buttons["Sign in"].isEnabled)
        capture(app, name: "Signed out")
    }

    @MainActor
    func testLibraryCanSaveThroughNativeQueueAndFilter() {
        let app = fixtureApp()
        XCTAssertTrue(app.staticTexts["Build with SwiftUI"].waitForExistence(timeout: 15))
        let saveLink = app.buttons["Save link"]
        if !saveLink.exists || !saveLink.isHittable {
            // iPad can place navigation actions in the system toolbar overflow.
            let overflow = app.navigationBars.buttons.matching(NSPredicate(
                format: "identifier == %@ OR identifier == %@ OR label == %@",
                "TopOverflowBarButtonItem", "OverflowBarButtonItem", "More"
            )).firstMatch
            XCTAssertTrue(overflow.waitForExistence(timeout: 5), app.debugDescription)
            overflow.tap()
        }
        XCTAssertTrue(saveLink.waitForExistence(timeout: 5), app.debugDescription)
        saveLink.tap()
        let field = app.textFields["Web link or AT URI"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("https://example.com/native-share-test")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Saved to L@tr.link."].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["https://example.com/native-share-test"].firstMatch.exists)
        app.buttons["Other"].tap()
        XCTAssertTrue(app.staticTexts["Build with SwiftUI"].exists)
        capture(app, name: "Library after native save")
    }

    @MainActor
    func testTabletAndPhoneSettingsAndFeedback() {
        let app = fixtureApp()
        XCTAssertTrue(app.staticTexts["Build with SwiftUI"].waitForExistence(timeout: 15))
        // iPad floating tabs expose both a wrapper and a nested button.
        let settings = app.buttons["Settings"].firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        XCTAssertTrue(app.staticTexts["Theme"].waitForExistence(timeout: 5))
        capture(app, name: "Native settings")
        app.swipeUp()
        let feedback = app.buttons["Send feedback"]
        if !feedback.isHittable { app.swipeUp() }
        feedback.tap()
        XCTAssertTrue(app.textFields["Title"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Publish"].exists)
        XCTAssertFalse(app.buttons["Publish"].isEnabled)
        capture(app, name: "Native feedback")
    }

    @MainActor
    func testSafariShareRetainsSignedOutDraft() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.textFields["AT Protocol handle"].waitForExistence(timeout: 10))
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.launch()
        let address = safari.textFields.matching(NSPredicate(format: "label == %@ OR identifier == %@ OR identifier == %@", "Address", "URL", "TabBarItemTitle")).firstMatch
        XCTAssertTrue(address.waitForExistence(timeout: 10))
        address.tap()
        safari.typeText("https://example.com/native-share-acceptance\n")
        dismissSafariTipIfPresent(safari)
        let directShare = safari.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", "ShareButton", "Share")).firstMatch
        let menu = safari.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", "MoreMenuButton", "More")).firstMatch
        if !waitUntilSafariActionable(directShare, in: safari, timeout: 3) {
            if !waitUntilSafariActionable(menu, in: safari, timeout: 5) {
                // Navigation can leave Safari's toolbar minimized, removing both
                // actions from accessibility. Scroll toward the top to reveal it.
                let page = safari.webViews.firstMatch
                XCTAssertTrue(page.waitForExistence(timeout: 10), safari.debugDescription)
                for _ in 0..<2 {
                    page.swipeDown()
                    if waitUntilSafariActionable(directShare, in: safari, timeout: 2) || waitUntilSafariActionable(menu, in: safari, timeout: 2) { break }
                }
            }
        }
        var shareIsActionable = false
        for attempt in 1...3 {
            dismissSafariTipIfPresent(safari, timeout: 0)
            // A visible but disabled Share action means the page is still loading.
            // Wait for it; another More tap would only toggle its menu closed.
            if directShare.exists {
                shareIsActionable = waitUntilSafariActionable(directShare, in: safari, timeout: 30)
                break
            }
            guard waitUntilSafariActionable(menu, in: safari, timeout: 15) else {
                capture(safari, name: "Safari More control unavailable")
                XCTFail("Safari More control did not become actionable. \(safari.debugDescription)")
                return
            }
            // Read again after waiting: late guidance can change menu visibility.
            if directShare.exists {
                shareIsActionable = waitUntilSafariActionable(directShare, in: safari, timeout: 30)
                break
            }
            capture(safari, name: "Safari More setup attempt \(attempt)")
            // Use the actual control's accessibility action. A window-coordinate
            // tap can silently miss even when the frame is correct.
            menu.tap()
            if directShare.waitForExistence(timeout: 5) {
                shareIsActionable = waitUntilSafariActionable(directShare, in: safari, timeout: 30)
                break
            }
            // Retry only setup when no Share action appeared. The next attempt
            // dismisses late guidance and requires More to be hittable again.
        }
        guard shareIsActionable else {
            capture(safari, name: "Safari Share control unavailable")
            XCTFail("Safari Share control did not become actionable after bounded setup. \(safari.debugDescription)")
            return
        }
        directShare.tap()
        let extensionButton = safari.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR label == %@", "L@tr.link", "Save to L@tr.link")).firstMatch
        let shareSheet = safari.otherElements["ActivityListView"].firstMatch
        let activities = safari.collectionViews["activityCollectionView"]
        // A cold simulator can expose the remote sheet shell before its activity
        // contents. Wait for contents, and do not confuse Safari's toolbar More
        // button underneath the sheet with the share sheet's activity picker.
        let sheetMore = shareSheet.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "More")).firstMatch
        let contents = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            extensionButton.exists || activities.exists || sheetMore.exists
        }, object: nil)
        guard XCTWaiter.wait(for: [contents], timeout: 30) == .completed else {
            capture(safari, name: "Safari share sheet missing activity contents")
            XCTFail("Safari share sheet did not expose activity contents. \(safari.debugDescription)")
            return
        }
        if !extensionButton.exists {
            if !sheetMore.exists || !sheetMore.isHittable {
                if activities.exists { activities.swipeLeft() } else { shareSheet.swipeLeft() }
            }
            guard waitUntilHittable(sheetMore, timeout: 10) else {
                XCTFail("Safari share sheet More activity was not hittable. \(safari.debugDescription)")
                return
            }
            sheetMore.tap()
        }
        XCTAssertTrue(extensionButton.waitForExistence(timeout: 10), safari.debugDescription)
        guard tapVisibleCenter(extensionButton, in: safari, timeout: 10, name: "L@tr.link share activity") else { return }
        let saveDraft = safari.buttons["Save draft"]
        XCTAssertTrue(saveDraft.waitForExistence(timeout: 10), safari.debugDescription)
        saveDraft.tap()
        let result = safari.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Draft retained.")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 10), safari.debugDescription)
        capture(safari, name: "Safari share draft retained")
        safari.buttons["Done"].tap()
    }

    @MainActor private func fixtureApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-library"]
        app.launch()
        return app
    }

    @MainActor private func waitUntilHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND hittable == true"), object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    @MainActor private func tapVisibleCenter(_ element: XCUIElement, in app: XCUIApplication, timeout: TimeInterval, name: String, file: StaticString = #filePath, line: UInt = #line) -> Bool {
        guard waitUntilHittable(element, timeout: timeout) else {
            XCTFail("\(name) is not hittable. \(app.debugDescription)", file: file, line: line)
            return false
        }
        // Remote share cells can report a valid frame while their accessibility
        // tap resolves outside it. This fallback is not used for Safari More.
        let window = app.windows.firstMatch
        let windowFrame = window.frame
        let visibleFrame = element.frame.intersection(windowFrame)
        guard !visibleFrame.isNull, !visibleFrame.isEmpty else {
            XCTFail("\(name) has no visible frame. \(app.debugDescription)", file: file, line: line)
            return false
        }
        capture(app, name: name)
        window.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(
            dx: visibleFrame.midX - windowFrame.minX,
            dy: visibleFrame.midY - windowFrame.minY
        )).tap()
        return true
    }

    @MainActor private func waitUntilActionable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND hittable == true AND enabled == true"), object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    @MainActor private func waitUntilSafariActionable(_ element: XCUIElement, in safari: XCUIApplication, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            // First-use guidance can arrive after navigation's initial check.
            // Handle it while waiting, before querying or tapping the toolbar.
            dismissSafariTipIfPresent(safari, timeout: 0)
            if element.exists && element.isHittable && element.isEnabled {
                if !safari.otherElements["TipView"].exists { return true }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return false
    }

    @discardableResult
    @MainActor private func dismissSafariTipIfPresent(_ safari: XCUIApplication, timeout: TimeInterval = 2) -> Bool {
        let tip = safari.otherElements["TipView"]
        guard tip.waitForExistence(timeout: timeout) else { return false }
        let close = tip.buttons["Close"].firstMatch
        guard tapVisibleCenter(close, in: safari, timeout: 2, name: "Safari guidance close") else { return false }
        let dismissed = tip.waitForNonExistence(timeout: 3)
        XCTAssertTrue(dismissed, safari.debugDescription)
        return dismissed
    }

    @MainActor private func capture(_ app: XCUIApplication, name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
