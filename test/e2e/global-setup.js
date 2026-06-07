import { rmSync, mkdirSync } from 'node:fs';

export default function globalSetup() {
  rmSync('test/data', { recursive: true, force: true });
  mkdirSync('test/data', { recursive: true });
}
