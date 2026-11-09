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
  manualGates: {
    minecraftJava1214: 'pending: unchanged artifact, six faces, version, SHA and logs',
    namedHardwareInputLatency: 'pending: measured real-device trace',
    pointerTrackpadDeviceMatrix: 'pending: real hardware beyond browser automation',
    creatorRepeatUseStudies: 'pending: observed creator tasks, cohort counts and findings'
  },
  compatibilityClaim: 'Experimental/unverified Java 1.21.4 visual replacement. No release certification is inferred from CI.'
};
mkdirSync('test-results/evidence', { recursive: true });
writeFileSync('test-results/evidence/release-evidence.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
