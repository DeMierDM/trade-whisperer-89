#!/bin/bash

# Script to create macOS .icns icon from favicon

FAVICON="public/favicon.ico"
ICONSET="assets/icon.iconset"
OUTPUT="assets/icon.icns"

echo "🎨 Creating macOS icon from favicon..."

# Create iconset directory
mkdir -p "$ICONSET"

# Convert ICO to PNG first (using largest size available)
sips -s format png "$FAVICON" --out "$ICONSET/temp.png" > /dev/null 2>&1

# Create all required icon sizes
echo "📐 Generating icon sizes..."
sips -z 16 16     "$ICONSET/temp.png" --out "$ICONSET/icon_16x16.png" > /dev/null 2>&1
sips -z 32 32     "$ICONSET/temp.png" --out "$ICONSET/icon_16x16@2x.png" > /dev/null 2>&1
sips -z 32 32     "$ICONSET/temp.png" --out "$ICONSET/icon_32x32.png" > /dev/null 2>&1
sips -z 64 64     "$ICONSET/temp.png" --out "$ICONSET/icon_32x32@2x.png" > /dev/null 2>&1
sips -z 128 128   "$ICONSET/temp.png" --out "$ICONSET/icon_128x128.png" > /dev/null 2>&1
sips -z 256 256   "$ICONSET/temp.png" --out "$ICONSET/icon_128x128@2x.png" > /dev/null 2>&1
sips -z 256 256   "$ICONSET/temp.png" --out "$ICONSET/icon_256x256.png" > /dev/null 2>&1
sips -z 512 512   "$ICONSET/temp.png" --out "$ICONSET/icon_256x256@2x.png" > /dev/null 2>&1
sips -z 512 512   "$ICONSET/temp.png" --out "$ICONSET/icon_512x512.png" > /dev/null 2>&1
sips -z 1024 1024 "$ICONSET/temp.png" --out "$ICONSET/icon_512x512@2x.png" > /dev/null 2>&1

# Remove temp file
rm "$ICONSET/temp.png"

# Create .icns file
echo "🔨 Building .icns file..."
iconutil -c icns "$ICONSET" -o "$OUTPUT"

# Clean up iconset directory
rm -rf "$ICONSET"

echo "✅ Icon created: $OUTPUT"
ls -lh "$OUTPUT"
