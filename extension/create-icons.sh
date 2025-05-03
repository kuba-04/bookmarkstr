#!/bin/bash

# Ensure output/icons directory exists
mkdir -p output/icons

# Generate icons using ImageMagick
convert -size 16x16 xc:#4A90E2 -font Arial -pointsize 10 -fill white -gravity center -draw "text 0,0 'B'" output/icons/icon16.png
convert -size 32x32 xc:#4A90E2 -font Arial -pointsize 20 -fill white -gravity center -draw "text 0,0 'B'" output/icons/icon32.png
convert -size 48x48 xc:#4A90E2 -font Arial -pointsize 30 -fill white -gravity center -draw "text 0,0 'B'" output/icons/icon48.png
convert -size 128x128 xc:#4A90E2 -font Arial -pointsize 80 -fill white -gravity center -draw "text 0,0 'B'" output/icons/icon128.png

echo "Icons generated in output/icons/" 