import { query } from '../db/index.js';

// Numbers for the vendor Admin console: who signed up, which plans they're on and how much
// of them they use. Customers are accounts with the platform role 'user' (not vendor staff).

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// The overview: sign-ups, activity, workspaces per plan, monthly plan value, usage.
export async function overview() {
  const period = currentPeriod();
  const [users, recentlyActive, plans, perPlan, usage, signups, upgrades] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = 'active')::int AS active,
                  COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
                  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS new_today,
                  COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_week,
                  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_month
             FROM users WHERE role = 'user'`),
    query(`SELECT COUNT(DISTINCT a.user_id)::int AS week,
                  COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at > now() - interval '1 day')::int AS day
             FROM activity_log a JOIN users u ON u.id = a.user_id
            WHERE u.role = 'user' AND a.created_at > now() - interval '7 days'`),
    query('SELECT id, name, price_inr, monthly_article_limit, monthly_ig_post_limit FROM plans ORDER BY price_inr, id'),
    query(`SELECT COALESCE(s.plan_id, 'free') AS plan_id,
                  COUNT(*)::int AS workspaces,
                  COUNT(*) FILTER (WHERE w.status = 'active')::int AS active
             FROM workspaces w LEFT JOIN subscriptions s ON s.workspace_id = w.id
            GROUP BY 1`),
    query(`SELECT COALESCE(SUM(articles_generated), 0)::int AS articles, COALESCE(SUM(ig_posts_generated), 0)::int AS ig_posts
             FROM usage_counters WHERE period = $1`, [period]),
    query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS signups
             FROM users WHERE role = 'user' AND created_at > now() - interval '30 days'
            GROUP BY 1 ORDER BY 1`),
    query("SELECT COUNT(*)::int AS pending FROM upgrade_requests WHERE status = 'pending'"),
  ]);
  const counts = Object.fromEntries(perPlan.rows.map((r) => [r.plan_id, r]));
  const planRows = plans.rows.map((p) => ({ ...p, workspaces: counts[p.id]?.workspaces || 0, active: counts[p.id]?.active || 0 }));
  return {
    period,
    users: { ...users.rows[0], active_week: recentlyActive.rows[0].week, active_day: recentlyActive.rows[0].day },
    plans: planRows,
    workspaces: planRows.reduce((n, p) => n + p.workspaces, 0),
    paying: planRows.filter((p) => Number(p.price_inr) > 0).reduce((n, p) => n + p.active, 0),
    monthly_value_inr: planRows.reduce((sum, p) => sum + Number(p.price_inr || 0) * p.active, 0),
    usage: usage.rows[0],
    signups: signups.rows,
    pending_upgrades: upgrades.rows[0].pending,
  };
}

// Every account with its workspaces: plan, this month's usage against the plan, whether a
// store and Instagram are connected, and when it last signed in or did anything.
export async function customers() {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.kind,
            (SELECT MAX(a.created_at) FROM activity_log a WHERE a.user_id = u.id AND a.action = 'login') AS last_login,
            (SELECT MAX(a.created_at) FROM activity_log a WHERE a.user_id = u.id) AS last_active,
            COALESCE(json_agg(json_build_object(
              'id', w.id, 'name', w.name, 'status', w.status, 'role', m.role,
              'plan_id', COALESCE(s.plan_id, 'free'), 'plan_name', p.name, 'price_inr', p.price_inr,
              'articles_used', COALESCE(uc.articles_generated, 0), 'articles_limit', p.monthly_article_limit,
              'ig_used', COALESCE(uc.ig_posts_generated, 0), 'ig_limit', p.monthly_ig_post_limit,
              'store', EXISTS (SELECT 1 FROM shopify_stores st WHERE st.workspace_id = w.id),
              'origin', w.origin, 'shop', w.shopify_shop, 'billing', s.billing_source,
              'instagram', (SELECT COUNT(*)::int FROM instagram_accounts ia WHERE ia.workspace_id = w.id)
            ) ORDER BY w.created_at) FILTER (WHERE w.id IS NOT NULL), '[]') AS workspaces
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       LEFT JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN subscriptions s ON s.workspace_id = w.id
       LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, 'free')
       LEFT JOIN usage_counters uc ON uc.workspace_id = w.id AND uc.period = $1
      GROUP BY u.id
      ORDER BY u.created_at DESC`,
    [currentPeriod()]
  );
  return rows;
}
