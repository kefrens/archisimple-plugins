import { parseSh3f } from './parser.js';

/**
 * SH3F importer extension entry point.
 *
 * The generic importer registration API is owned by ArchiSimple core/SDK.
 * Once that API is available, this extension registers `.sh3f` here.
 */
export { parseSh3f };

export default {
  id: 'com.archisimple.sh3f-importer',
  activate(context) {
    context?.logger?.info?.('Sweet Home 3D SH3F importer activated');
  },
  deactivate() {}
};
