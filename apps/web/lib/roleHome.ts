export const ROLE_HOME: Record<string, string> = {
  super_admin: '/super-admin',
  school_admin: '/admin',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
  finance: '/finance',
  coordinator: '/coordinator',
};

export function getRoleHome(role: string): string {
  return ROLE_HOME[role] ?? '/login';
}
