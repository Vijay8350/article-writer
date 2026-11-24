import { allows } from '../services/usage.js';
import { featureLabel } from '../lib/planFeatures.js';

// Blocks a request when the active workspace's plan doesn't include the feature
// (vendor admins edit plans feature by feature). Mount after requireWorkspace.
// `key` may be a function of the request (one router can hold several features).
export function requireFeature(key) {
  return async (req, res, next) => {
    try {
      const feature = typeof key === 'function' ? key(req) : key;
      if (!feature || await allows(req.workspace.id, feature)) return next();
      return res.status(403).json({
        success: false,
        code: 'FEATURE_LOCKED',
        feature,
        error: `Your plan doesn't include ${featureLabel(feature)}. Upgrade your plan to use it.`,
      });
    } catch (err) { return next(err); }
  };
}
