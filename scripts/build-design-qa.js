const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const views = ['home', 'today', 'create', 'wardrobe', 'collection', 'me', 'result', 'picker'];
const captureDir = process.argv[2];
const screenshotDir = path.join('docs', 'design', 'implementation-screens');

if (!captureDir) {
  throw new Error('Usage: node scripts/build-design-qa.js <full-screen-capture-dir>');
}

async function build() {
  fs.mkdirSync(screenshotDir, { recursive: true });

  for (const view of views) {
    await sharp(path.join(captureDir, `${view}.png`))
      .extract({ left: 577, top: 78, width: 390, height: 844 })
      .png()
      .toFile(path.join(screenshotDir, `${view}.png`));
  }

  const boardCells = [];
  for (let index = 0; index < views.length; index += 1) {
    const input = await sharp(path.join(screenshotDir, `${views[index]}.png`))
      .resize(302, 654, { fit: 'fill' })
      .toBuffer();
    boardCells.push({
      input,
      left: 8 + (index % 4) * 310,
      top: 8 + Math.floor(index / 4) * 662
    });
  }

  await sharp({
    create: { width: 1248, height: 1332, channels: 4, background: '#e9e2d8' }
  })
    .composite(boardCells)
    .png()
    .toFile(path.join('docs', 'design', 'implementation-board.png'));

  const comparisonTitle = Buffer.from(`
    <svg width="2524" height="46" xmlns="http://www.w3.org/2000/svg">
      <style>text { font-family: Arial, sans-serif; font-weight: 700; font-size: 20px; fill: #3f322a; }</style>
      <text x="16" y="31">SOURCE · SOFT ATELIER 02</text>
      <text x="1282" y="31">IMPLEMENTATION · 390 × 844</text>
    </svg>
  `);

  await sharp({
    create: { width: 2524, height: 1378, channels: 4, background: '#e9e2d8' }
  })
    .composite([
      { input: path.join('docs', 'design', 'soft-atelier-reference.png'), left: 8, top: 52 },
      { input: path.join('docs', 'design', 'implementation-board.png'), left: 1268, top: 46 },
      { input: comparisonTitle, left: 0, top: 0 }
    ])
    .png()
    .toFile(path.join('docs', 'design', 'qa-comparison.png'));

  for (const view of ['home', 'wardrobe']) {
    const outputPath = path.join('docs', 'design', `qa-focused-${view}.png`);
    const sourceScreen = await sharp(outputPath)
      .extract({ left: 10, top: 46, width: 390, height: 844 })
      .toBuffer();
    const implementationScreen = await sharp(path.join(screenshotDir, `${view}.png`)).toBuffer();
    const labels = Buffer.from(`
      <svg width="824" height="46" xmlns="http://www.w3.org/2000/svg">
        <style>text { font-family: Arial, sans-serif; font-weight: 700; font-size: 18px; fill: #3f322a; }</style>
        <text x="12" y="29">SOURCE</text>
        <text x="426" y="29">IMPLEMENTATION</text>
      </svg>
    `);
    const temporaryPath = `${outputPath}.new`;

    await sharp({
      create: { width: 824, height: 894, channels: 4, background: '#e9e2d8' }
    })
      .composite([
        { input: sourceScreen, left: 10, top: 46 },
        { input: implementationScreen, left: 424, top: 46 },
        { input: labels, left: 0, top: 0 }
      ])
      .png()
      .toFile(temporaryPath);

    fs.renameSync(temporaryPath, outputPath);
  }
}

build()
  .then(() => console.log('Final design QA images rebuilt.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
