const fs = require('fs-extra');

async function renameFile() {
  try {
    await fs.rename('dist/main.js', 'dist/index.js');
    console.log('Renamed main.js to index.js');
  } catch (err) {
    console.error('Error renaming file:', err);
  }
}

renameFile();
