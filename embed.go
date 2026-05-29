package filemanager

import "embed"

// FrontendDist holds the static assets built from the React application.
// We use the `all:` prefix to ensure hidden/dot files within the build are also embedded.
//
//go:embed frontend/dist
var FrontendDist embed.FS
