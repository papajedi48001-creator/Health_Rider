import manifestJson from '../../../releases.json';
import { parseReleaseManifest } from '@/domain/system-update/releases';

// The manifest this build was made from. Its newest entry is the version that is running now.
export const bundledManifest = parseReleaseManifest(manifestJson);
export const runningRelease = bundledManifest.releases[0]!;
