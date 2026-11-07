import os

routes_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\routes\auth-routes.ts'
with open(routes_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Add GET /users, PUT /users/:id, DELETE /users/:id
new_routes = """
/**
 * GET /api/v1/auth/users
 * Central Admin: List all users and their company access
 */
authRouter.get('/users', requireAuth, requireCentralAdmin, async (req: Request, res: Response) => {
  try {
    const usersQ = await pool.query(`
      SELECT 
        u.id, 
        u.username, 
        u.display_name, 
        u.email, 
        u.role, 
        u.is_active, 
        u.must_change_password, 
        u.last_login_at, 
        u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'companyId', c.id,
              'companyCode', c.code,
              'companyName', c.name,
              'canView', uc.can_view,
              'canManageProducts', uc.can_manage_products,
              'canManageOrders', uc.can_manage_orders,
              'canDispatch', uc.can_dispatch,
              'canCancelDispatch', uc.can_cancel_dispatch,
              'canViewReports', uc.can_view_reports,
              'canManageSettings', uc.can_manage_settings
            )
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as company_access
      FROM users u
      LEFT JOIN user_company_access uc ON uc.user_id = u.id
      LEFT JOIN companies c ON c.id = uc.company_id
      GROUP BY u.id
      ORDER BY u.id ASC
    `);

    res.json(usersQ.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/v1/auth/users/:id
 * Central Admin: Update user details, role, password, and company permissions
 */
authRouter.put('/users/:id', requireAuth, requireCentralAdmin, async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const { displayName, email, password, role, isActive, companyAccess } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'INVALID_ID' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update user info
    if (password && password.trim().length >= 6) {
      const hash = await hashPassword(password.trim());
      await client.query(
        `UPDATE users SET 
           display_name = COALESCE($1, display_name), 
           email = $2, 
           role = COALESCE($3, role), 
           is_active = COALESCE($4, is_active), 
           password_hash = $5 
         WHERE id = $6`,
        [displayName?.trim() || null, email?.trim() || null, role || null, typeof isActive === 'boolean' ? isActive : null, hash, userId]
      );
    } else {
      await client.query(
        `UPDATE users SET 
           display_name = COALESCE($1, display_name), 
           email = $2, 
           role = COALESCE($3, role), 
           is_active = COALESCE($4, is_active) 
         WHERE id = $5`,
        [displayName?.trim() || null, email?.trim() || null, role || null, typeof isActive === 'boolean' ? isActive : null, userId]
      );
    }

    // If company access mappings provided
    if (Array.isArray(companyAccess)) {
      await client.query(`DELETE FROM user_company_access WHERE user_id = $1`, [userId]);
      for (const a of companyAccess) {
        if (a.companyId && a.canView) {
          await client.query(
            `INSERT INTO user_company_access (
               user_id, company_id, can_view, can_manage_products, can_manage_orders,
               can_dispatch, can_cancel_dispatch, can_view_reports, can_manage_settings
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              userId,
              Number(a.companyId),
              Boolean(a.canView ?? true),
              Boolean(a.canManageProducts),
              Boolean(a.canManageOrders),
              Boolean(a.canDispatch),
              Boolean(a.canCancelDispatch),
              Boolean(a.canViewReports ?? true),
              Boolean(a.canManageSettings)
            ]
          );
        }
      }
    }

    await AuditService.log({
      userId: req.user!.id,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: userId,
      ipAddress: req.ip
    });

    await client.query('COMMIT');
    res.json({ success: true, message: 'User updated successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/auth/users/:id
 * Central Admin: Deactivate user account
 */
authRouter.delete('/users/:id', requireAuth, requireCentralAdmin, async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (userId === req.user!.id) {
    return res.status(400).json({ error: 'CANNOT_DELETE_SELF', message: 'You cannot deactivate your own admin account.' });
  }

  try {
    await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [userId]);
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);

    await AuditService.log({
      userId: req.user!.id,
      action: 'DEACTIVATE',
      entityType: 'USER',
      entityId: userId,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
"""

# Append before or at the end
code += new_routes

with open(routes_path, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(code)
print("Updated auth-routes.ts successfully")
