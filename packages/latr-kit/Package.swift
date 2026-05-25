// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LatrKit",
    platforms: [
        .macOS(.v14),
        .iOS(.v17),
    ],
    products: [
        .library(name: "LatrKit", targets: ["LatrKit"]),
    ],
    targets: [
        .target(
            name: "LatrKit",
            path: "Sources/LatrKit"
        ),
        .testTarget(
            name: "LatrKitTests",
            dependencies: ["LatrKit"],
            path: "Tests/LatrKitTests"
        ),
    ]
)
