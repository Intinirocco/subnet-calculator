// Ingresso per i moduli ES: import SubnetLib, { info, plan } from './subnet-lib.mjs'
// Il codice sta tutto in subnet-lib.js, che deve restare nella stessa cartella.
import './subnet-lib.js';

const lib = globalThis.SubnetLib;
export default lib;
export const {
  info, split, plan, verify, parseCidr, parseEntry, allocate,
  parseIp, ipStr, toBinary, maskBits, wildStr, parseMask, sizeOf, hostsOf, hostBitsFor, maskForHosts,
  lastOf, cidr, usableOf, gatewayNum, gatewayOf, firstHostNum, lastHostNum, broadcastOf,
  classFor, classOf, classMaskOf, typeOf,
} = lib;
