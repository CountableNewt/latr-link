import Crypto
import Foundation

public actor SQLiteBookmarkPreviewStore: BookmarkPreviewStore {
    private let database: SQLiteDatabase

    public init(database: SQLiteDatabase) { self.database = database }

    public func preview(for subject: String) async throws -> OpenGraphFields? {
        let rows = try database.query("""
            SELECT title, description, image_url, site_name, author FROM bookmark_previews
            WHERE subject_hash = ? AND julianday(expires_at) > julianday('now')
            """, [subjectHash(subject)])
        guard let row = rows.first else { return nil }
        return OpenGraphFields(title: row[0], description: row[1], image: row[2], siteName: row[3], author: row[4])
    }

    public func store(_ preview: OpenGraphFields, for subject: String) async throws {
        try database.query("""
            INSERT INTO bookmark_previews(subject_hash, subject, title, description, image_url, site_name, author)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(subject_hash) DO UPDATE SET subject = excluded.subject, title = excluded.title,
                description = excluded.description, image_url = excluded.image_url, site_name = excluded.site_name,
                author = excluded.author, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
                expires_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','+7 days')
            """, [subjectHash(subject), subject, preview.title, preview.description, preview.image, preview.siteName, preview.author])
    }

    private func subjectHash(_ subject: String) -> String {
        SHA256.hash(data: Data(subject.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
