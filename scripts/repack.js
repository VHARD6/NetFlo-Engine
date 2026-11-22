const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const asarPath = path.join(projectRoot, 'release', 'win-unpacked', 'resources', 'app.asar');
const stagingDir = path.join(os.tmpdir(), 'netflo_asar_staging_' + Date.now());

console.log('[Repack] Starting asar update...');
console.log(`[Repack] Target: ${asarPath}`);
console.log(`[Repack] Staging: ${stagingDir}`);

try {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  // 1. Extract existing asar
  console.log('[Repack] Extracting existing app.asar...');
  execSync(`npx asar extract "${asarPath}" "${stagingDir}"`, { stdio: 'inherit' });

  // 2. Copy dist files into staging
  console.log('[Repack] Copying fresh dist/ files...');
  const distSrc = path.join(projectRoot, 'dist');
  const distDest = path.join(stagingDir, 'dist');
  fs.cpSync(distSrc, distDest, { recursive: true, force: true });

  // 3. Copy package.json
  console.log('[Repack] Copying updated package.json...');
  fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(stagingDir, 'package.json'));

  // 4. Repack asar
  console.log('[Repack] Packing updated app.asar...');
  execSync(`npx asar pack "${stagingDir}" "${asarPath}"`, { stdio: 'inherit' });

  console.log('[Repack] Successfully repacked app.asar!');
} catch (err) {
  console.error('[Repack] Failed:', err);
  process.exit(1);
} finally {
  if (fs.existsSync(stagingDir)) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
