export const PLATFORM_PERMISSIONS = [
  { key: "administrator", label: "Administrator (Admin Panel Access)" },
  { key: "access_dashboard", label: "Access Dashboard" },
  { key: "manage_subscription", label: "Manage Subscription" },
  { key: "view_billing", label: "View Billing" },
  { key: "edit_profile", label: "Edit Profile" },
] as const;

export type PlatformPermissionKey = typeof PLATFORM_PERMISSIONS[number]["key"];
