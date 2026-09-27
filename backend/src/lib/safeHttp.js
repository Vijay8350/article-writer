import dns from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';

// SSRF guard for server-side fetches of user-supplied URLs. Refuses loopback,
// private, link-local (incl. the EC2 metadata endpoint 169.254.169.254) and other
// non-public addresses. The check runs inside the socket's DNS lookup, so it also
// covers every redirect hop and DNS names that point at internal IPs.
//
// Usage: axios.create({ ...safeAxiosConfig, ... })

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)     // carrier-grade NAT
    || (a === 169 && b === 254)               // link-local / cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)); // benchmarking
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
}

const refuse = (host) =>
  Object.assign(new Error(`Refusing to fetch ${host}: not a public address`), { status: 400, code: 'EPRIVATEADDR' });

// Literal IPs and localhost never reach DNS lookup, so they're checked up front.
export function assertPublicHost(hostname, protocol = 'https:') {
  if (!['http:', 'https:'].includes(protocol)) {
    throw Object.assign(new Error(`Unsupported URL protocol ${protocol}`), { status: 400 });
  }
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || (net.isIP(host) && isPrivateAddress(host))) {
    throw refuse(host);
  }
}

function publicOnlyLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const all = Array.isArray(address) ? address : [{ address }];
    if (all.some((a) => isPrivateAddress(a.address))) return callback(refuse(hostname));
    callback(null, address, family);
  });
}

export const safeAxiosConfig = {
  httpAgent: new http.Agent({ lookup: publicOnlyLookup }),
  httpsAgent: new https.Agent({ lookup: publicOnlyLookup }),
  beforeRedirect: (options) => assertPublicHost(options.hostname, options.protocol),
};
