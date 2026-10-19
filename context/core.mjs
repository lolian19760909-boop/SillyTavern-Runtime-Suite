import './core/vendor/sha256.js';
import * as CryptoModule from './core/crypto.js';
import * as CloneModule from './core/data-clone.js';
import * as RequestsModule from './core/requests.js';
import * as CompactModule from './core/compact.js';
export const Crypto = CryptoModule.default || globalThis.TavernContextCryptoCore;
export const Clone = CloneModule.default || globalThis.TavernContextDataCloneCore;
export const Requests = RequestsModule.default || globalThis.TavernContextRequestsCore;
export const Compact = CompactModule.default || globalThis.TavernContextCompactCore;
