import Foundation
import Logging
import NIOSSL
import PostgresNIO

public enum PostgresConfigError: Error, Sendable {
    case invalidURL(String)
}
