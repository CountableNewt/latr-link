import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

func secureRandomBytes(count: Int) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: count)
    #if canImport(Darwin)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    precondition(status == errSecSuccess, "Failed to generate API key material")
    #else
    let fd = open("/dev/urandom", O_RDONLY)
    precondition(fd >= 0, "Failed to open /dev/urandom")
    defer { close(fd) }
    var remaining = count
    var offset = 0
    while remaining > 0 {
        let readCount = read(fd, &bytes[offset], remaining)
        precondition(readCount > 0, "Failed to read /dev/urandom")
        remaining -= readCount
        offset += readCount
    }
    #endif
    return bytes
}
