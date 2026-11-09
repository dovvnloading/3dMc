import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sha256 = path => existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const record = {
  format: '3dmc-release-evidence', version: 1,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  applicationVersion: pkg.version, documentSchemaVersion: 3, nativeContainerVersion: 2,
  node: process.version, platform: process.platform, architecture: process.arch,
  workflow: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  automatedStatus: 'Consult the linked workflow conclusion; this record is also emitted for failed runs.',
  sha256: {
    dependencyLockfile: sha256('package-lock.json'),
    sourceSnapshot: sha256('test-results/evidence/source-snapshot.tar.gz'),
    sixFaceDiagnosticZip: sha256('test-results/six-face-orientation-test.zip'),
    textureResourceMeasurements: sha256('test-results/performance/texture-lifecycle.json')
  },
  additionalChecks: {
    minecraftJava1214: 'A limited client run is recorded in docs/evidence/java-1.21.4-2026-11-09/REPORT.md; CI does not rerun Minecraft.',
    hardware: 'A local NVIDIA desktop run is recorded in docs/evidence/device-windows-2026-11-09/REPORT.md; CI does not test every device.',
    accessibility: 'Keyboard workflows are automated; screen-reader behavior is not measured by this run.'
  },
  compatibilityClaim: 'Experimental Java static-block replacement. The recorded Minecraft run covers a narrow 1.21.4 fixture, not every exported model.'
};
mkdirSync('test-results/evidence', { recursive: true });
writeFileSync('test-results/evidence/release-evidence.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
