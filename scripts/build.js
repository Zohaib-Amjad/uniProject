const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('=== QUIZPRO VERCEL & STATIC DEPLOYMENT BUILD ===');
console.log('Project root:', rootDir);

const filesToCopy = ['index.html', 'login.html', 'quiz.html', 'register.html'];
const dirsToCopy = ['css', 'js', 'assets'];

// Targets to populate so Vercel / Netlify / Render / GitHub Pages / direct root all work seamlessly
const targetDirs = [
  path.join(rootDir, 'public'),
  path.join(rootDir, 'dist')
];

targetDirs.forEach((targetDir) => {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy HTML files
  filesToCopy.forEach((file) => {
    const src = path.join(rootDir, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });

  // Copy asset directories
  dirsToCopy.forEach((dir) => {
    const src = path.join(rootDir, dir);
    const dest = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  });

  console.log(`[OK] Populated deployment target: ${path.relative(rootDir, targetDir)}/`);
});

console.log('[SUCCESS] Build completed. Static site ready in root, public/, and dist/.');
