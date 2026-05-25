import Foundation

enum OpenGraphMerger {
    static func externalSaveNeedsPreview(_ record: ExternalSave) -> Bool {
        !(record.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && record.image?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
    }

    static func savedItemNeedsPreview(_ record: SavedItem) -> Bool {
        !(record.previewTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && record.previewImage?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
    }

    static func merging(into existing: ExternalSave, preview: OpenGraphPreview) -> ExternalSave? {
        var merged = existing

        if let title = preview.title,
           existing.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.title = String(title.prefix(OpenGraphLimits.title))
        }
        if let description = preview.description,
           existing.excerpt?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.excerpt = String(description.prefix(OpenGraphLimits.excerpt))
        }
        if let image = preview.image,
           existing.image?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.image = image
        }
        if let siteName = preview.siteName,
           existing.site?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.site = String(siteName.prefix(OpenGraphLimits.site))
        }
        if let author = preview.author,
           existing.author?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.author = String(author.prefix(OpenGraphLimits.author))
        }

        return merged == existing ? nil : merged
    }

    static func merging(into existing: SavedItem, preview: OpenGraphPreview) -> SavedItem? {
        var merged = existing

        if let title = preview.title,
           existing.previewTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.previewTitle = String(title.prefix(OpenGraphLimits.title))
        }
        if let description = preview.description,
           existing.previewExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.previewExcerpt = String(description.prefix(OpenGraphLimits.excerpt))
        }
        if let image = preview.image,
           existing.previewImage?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.previewImage = image
        }
        if let siteName = preview.siteName,
           existing.previewSite?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.previewSite = String(siteName.prefix(OpenGraphLimits.site))
        }
        if let author = preview.author,
           existing.previewAuthor?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
        {
            merged.previewAuthor = String(author.prefix(OpenGraphLimits.author))
        }

        return merged == existing ? nil : merged
    }
}
