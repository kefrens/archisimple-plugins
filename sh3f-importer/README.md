# Sweet Home 3D SH3F Importer

ArchiSimple extension for importing Sweet Home 3D furniture libraries (`.sh3f`).

## Scope

- Reads the Sweet Home 3D `PluginFurnitureCatalog.properties` catalogue.
- Supports localized catalogue files.
- Extracts furniture metadata, dimensions, categories, tags and model/icon references.
- Preserves embedded model and image entries for lazy loading by the ArchiSimple asset pipeline.
- Supports stored and deflated ZIP entries in browser-compatible runtimes.

The extension contains all SH3F-specific format knowledge. Generic importer registration and asset APIs remain owned by ArchiSimple core/SDK.
