const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 32, 48, 128];

function createIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Draw background
    ctx.fillStyle = '#4a90e2';
    ctx.fillRect(0, 0, size, size);

    // Draw text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.floor(size * 0.6)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', size/2, size/2);

    return canvas.toBuffer();
}

// Create output directory if it doesn't exist
if (!fs.existsSync('output/icons')) {
    fs.mkdirSync('output/icons', { recursive: true });
}

// Generate icons
sizes.forEach(size => {
    const iconData = createIcon(size);
    fs.writeFileSync(`output/icons/icon${size}.png`, iconData);
    console.log(`Created icon${size}.png`);
}); 