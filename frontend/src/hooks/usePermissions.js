import { useUser } from '../App'

// Role hierarchy: rep (1) < manager (2) < admin (3)
const ROLE_LEVEL = { rep: 1, manager: 2, admin: 3 }

// Map permission → minimum role required
const PERMISSIONS = {
  manage_users:     'admin',
  manage_stages:    'admin',
  manage_settings:  'admin',
  delete_accounts:  'manager',
  delete_deals:     'manager',
  manage_workflows: 'manager',
  manage_templates: 'manager',
  view_analytics:   'rep',    // all roles
}

export function usePermissions() {
  const { currentUser } = useUser()
  const role  = currentUser?.role ?? 'rep'
  const level = ROLE_LEVEL[role] ?? 1

  function can(permission) {
    const minRole  = PERMISSIONS[permission]
    if (!minRole) return true                       // unknown permission → allow
    const minLevel = ROLE_LEVEL[minRole] ?? 1
    return level >= minLevel
  }

  return {
    can,
    role,
    isAdmin:   role === 'admin',
    isManager: level >= 2,
  }
}
