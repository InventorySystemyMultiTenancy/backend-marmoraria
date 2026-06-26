export interface UserPermissions {
  clients_view: boolean;
  clients_create: boolean;
  clients_edit: boolean;
  clients_delete: boolean;

  quotes_view: boolean;
  quotes_create: boolean;
  quotes_edit: boolean;
  quotes_delete: boolean;
  quotes_approve: boolean;
  quotes_pdf: boolean;

  orders_view: boolean;
  orders_create: boolean;
  orders_update_status: boolean;
  orders_view_costs: boolean;

  stock_view: boolean;
  stock_edit: boolean;
  stock_add: boolean;

  financial_view: boolean;
  financial_create: boolean;
  financial_edit: boolean;
  financial_reports: boolean;

  marbles_view: boolean;
  marbles_edit: boolean;
  marbles_create: boolean;
  marbles_delete: boolean;

  users_view: boolean;
  users_create: boolean;
  users_edit: boolean;
  users_set_permissions: boolean;
}

export const PERMISSION_KEYS: (keyof UserPermissions)[] = [
  'clients_view', 'clients_create', 'clients_edit', 'clients_delete',
  'quotes_view', 'quotes_create', 'quotes_edit', 'quotes_delete', 'quotes_approve', 'quotes_pdf',
  'orders_view', 'orders_create', 'orders_update_status', 'orders_view_costs',
  'stock_view', 'stock_edit', 'stock_add',
  'financial_view', 'financial_create', 'financial_edit', 'financial_reports',
  'marbles_view', 'marbles_edit', 'marbles_create', 'marbles_delete',
  'users_view', 'users_create', 'users_edit', 'users_set_permissions',
];

export const DEFAULT_PERMISSIONS: UserPermissions = PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {} as UserPermissions);

export const ADMIN_PERMISSIONS: UserPermissions = PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = key !== 'users_set_permissions';
  return acc;
}, {} as UserPermissions);

export const SALESPERSON_PERMISSIONS: UserPermissions = {
  ...DEFAULT_PERMISSIONS,
  clients_view: true,
  clients_create: true,
  clients_edit: true,
  quotes_view: true,
  quotes_create: true,
  quotes_edit: true,
  quotes_pdf: true,
  marbles_view: true,
  stock_view: true,
};
